var window = self;
var unzip = require('unzip-js');

async function fetchBlobWithFallbacks(url) {
  if (!url) return null;

  const urlCandidates = [url];
  if (url.includes('cdn.beatsaver.com')) {
    urlCandidates.push(url.replace('cdn.beatsaver.com', 'r2cdn.beatsaver.com'));
  }

  for (let i = 0; i < urlCandidates.length; i++) {
    try {
      const res = await fetch(urlCandidates[i], { mode: 'cors' });
      if (res.ok) {
        return await res.blob();
      }
    } catch (e) {
      console.warn('[zip-loader] Direct fetch candidate failed:', urlCandidates[i], e);
    }
  }

  // CORS proxies fallback
  const proxies = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?'
  ];

  for (let i = 0; i < proxies.length; i++) {
    try {
      const proxyUrl = proxies[i] + encodeURIComponent(url);
      const res = await fetch(proxyUrl);
      if (res.ok) {
        return await res.blob();
      }
    } catch (e) {
      console.warn('[zip-loader] Proxy fetch failed:', proxies[i], e);
    }
  }

  return null;
}

function parseJsonSafe(chunks) {
  let str = '';
  try {
    if (typeof Buffer !== 'undefined' && Buffer.concat) {
      str = Buffer.concat(chunks).toString('utf8');
    } else {
      const totalLen = chunks.reduce((acc, c) => acc + (c.length || c.byteLength || 0), 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (let i = 0; i < chunks.length; i++) {
        const item = chunks[i];
        if (item instanceof Uint8Array) {
          merged.set(item, offset);
          offset += item.length;
        } else if (item.buffer) {
          merged.set(new Uint8Array(item.buffer, item.byteOffset, item.byteLength), offset);
          offset += item.byteLength;
        }
      }
      str = new TextDecoder('utf-8').decode(merged);
    }

    str = str.replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
    return JSON.parse(str);
  } catch (e) {
    try {
      const first = str.indexOf('{');
      const last = str.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        return JSON.parse(str.substring(first, last + 1));
      }
    } catch (err) {}
    console.error('[zip-loader] JSON parse error:', e);
    return null;
  }
}

addEventListener('message', async function (evt) {
  if (evt.data.abort) { return; }

  const version = evt.data.version;
  const hash = evt.data.hash;
  const bpm = evt.data.bpm;
  const directDownload = evt.data.directDownload;

  if (!directDownload) {
    postMessage({ message: 'error', version: version });
    return;
  }

  try {
    const blob = await fetchBlobWithFallbacks(directDownload);
    if (!blob) {
      console.error('[zip-loader] Could not fetch zip blob:', directDownload);
      postMessage({ message: 'error', version: version });
      return;
    }

    unzip(blob, function (err, zipFile) {
      if (err || !zipFile) {
        console.error('[zip-loader] Unzip error:', err);
        postMessage({ message: 'error', version: version });
        return;
      }

      zipFile.readEntries(function (err, entries) {
        if (err || !entries || !entries.length) {
          console.error('[zip-loader] Read entries error:', err);
          postMessage({ message: 'error', version: version });
          return;
        }

        const data = {
          audio: undefined,
          beats: {},
          info: undefined
        };

        const beatFiles = {};
        const totalEntries = entries.length;
        let processedEntries = 0;

        function getBeatFile(filename) {
          if (!filename) return null;
          const clean = filename.replace(/^[\\/\.]+/, '');
          const base = clean.split('/').pop().split('\\').pop();
          const baseLower = base.toLowerCase();
          return beatFiles[filename] || beatFiles[clean] || beatFiles[base] || beatFiles[baseLower];
        }

        function finishProcessing() {
          if (!data.audio) {
            console.error('[zip-loader] Audio file missing in zip.');
            postMessage({ message: 'error', version: version });
            return;
          }

          if (data.info) {
            const sets = data.info._difficultyBeatmapSets || data.info.difficultyBeatmapSets || [];
            for (let s = 0; s < sets.length; s++) {
              const set = sets[s];
              const charName = set._beatmapCharacteristicName || set.beatmapCharacteristicName || 'Standard';
              const diffs = set._difficultyBeatmaps || set.difficultyBeatmaps || [];

              for (let d = 0; d < diffs.length; d++) {
                const diffObj = diffs[d];
                const difficulty = diffObj._difficulty || diffObj.difficulty;
                const beatmapFilename = diffObj._beatmapFilename || diffObj.beatmapFilename || diffObj.filename;
                const beatData = getBeatFile(beatmapFilename);

                if (beatData && difficulty) {
                  const id = charName + '-' + difficulty;
                  data.beats[id] = beatData;
                  data.beats[difficulty] = beatData;
                  data.beats[difficulty.toLowerCase()] = beatData;
                  data.beats[charName + '-' + difficulty.toLowerCase()] = beatData;
                  data.beats['Standard-' + difficulty] = beatData;
                  data.beats['Standard-' + difficulty.toLowerCase()] = beatData;
                }
              }
            }
          }

          if (Object.keys(data.beats).length === 0) {
            for (const k in beatFiles) {
              data.beats[k] = beatFiles[k];
              data.beats['Standard-' + k] = beatFiles[k];
            }
          }

          postMessage({ message: 'load', data: data, version: version, hash: hash });
        }

        entries.forEach(function (entry) {
          const chunks = [];

          zipFile.readEntryData(entry, false, function (err, readStream) {
            if (err || !readStream) {
              processedEntries++;
              if (processedEntries === totalEntries) { finishProcessing(); }
              return;
            }

            readStream.on('data', function (chunk) {
              chunks.push(chunk);
            });

            readStream.on('error', function () {
              processedEntries++;
              if (processedEntries === totalEntries) { finishProcessing(); }
            });

            readStream.on('end', function () {
              const entryName = entry.name || '';
              const lowerName = entryName.toLowerCase();

              if (lowerName.endsWith('.egg') || lowerName.endsWith('.ogg') || lowerName.endsWith('.wav') || lowerName.endsWith('.mp3')) {
                try {
                  const mime = lowerName.endsWith('.mp3') ? 'audio/mpeg' : (lowerName.endsWith('.wav') ? 'audio/wav' : 'audio/ogg');
                  const audioBlob = new Blob(chunks, { type: mime });
                  data.audio = URL.createObjectURL(audioBlob);
                } catch (e) {
                  console.error('[zip-loader] Error creating audio blob:', e);
                }
              } else if (lowerName.endsWith('.dat') || lowerName.endsWith('.json')) {
                const value = parseJsonSafe(chunks);
                if (value) {
                  const base = entryName.split('/').pop().split('\\').pop();
                  const baseLower = base.toLowerCase();

                  if (baseLower === 'info.dat') {
                    data.info = value;
                  } else {
                    value._beatsPerMinute = bpm;
                    beatFiles[entryName] = value;
                    beatFiles[base] = value;
                    beatFiles[baseLower] = value;
                  }
                }
              }

              processedEntries++;
              if (processedEntries === totalEntries) {
                finishProcessing();
              }
            });
          });
        });
      });
    });
  } catch (err) {
    console.error('[zip-loader] Unexpected worker error:', err);
    postMessage({ message: 'error', version: version });
  }
});
