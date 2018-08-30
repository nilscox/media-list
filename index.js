const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const fetch = require('node-fetch');
const expressReact = require('express-react-views');

const app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'jsx');
app.engine('jsx', expressReact.createEngine({ beautify: true }));
app.use(express.static(__dirname + '/static'));

const getEnv = (name, defaultValue) => {
  let value = process.env[name];

  if (!value)
    value = defaultValue;

  if (!value)
    throw new Error('missing env ' + name);

  return value;
}

const PORT = getEnv('PORT', 4242);
const MEDIA_PATH = getEnv('MEDIA_PATH');
const OMDB_API_KEY = getEnv('OMDB_API_KEY');
const MANIFEST_PATH = getEnv('MANIFEST_PATH', path.join(MEDIA_PATH, 'manifest.json'));
const EXTENSIONS = ['.avi', '.mp4', '.mkv'];

const walkDirectory = async dir => {
  const files = await fs.readdir(dir);
  const obj = {};

  for (let i = 0; i < files.length; ++i) {
    const filename = files[i];
    const filepath = path.join(dir, filename);
    const stats = await fs.stat(filepath);

    if (stats.isFile())
      obj[filename] = stats;
    else if (stats.isDirectory())
      obj[filename] = await walkDirectory(filepath);
  }

  return obj;
};

const normalizeFilename = filename => {
  const shouldKeep = str => {
    return [
      /\d{4}/i,
      /^vost/i,
      /^(webrip|dvdrip|brrip|dvd|bluray|divx|hd)$/i,
      /^(xvid|utt|ac3|aac|rarbg|h\d{3}|x\d{3})$/i,
      /^(yify|french|truefrench|fastsub|remastered)$/i,
      /^(cd\d|\d{3,4}p)$/i,
    ].map(r => str.match(r)).filter(match => !!match).length === 0;
  };

  return filename
    .replace(/www\.[^\.]*\.(com|fr|net|org)/i, '')
    .replace(/\.|-|_/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^\)]*\)/g, '')
    .replace(new RegExp(`(${EXTENSIONS.join('|')})$`), '')
    .split(' ')
    .filter(shouldKeep)
    .join(' ')
    .trim();
};

const filesTree = async dir => {
  const rec = (files, basePath) => {
    const tree = {};
    const keys = Object.keys(files);

    for (let i = 0; i < keys.length; ++i) {
      const filename = keys[i]
      const filepath = path.join(basePath, filename);
      const file = files[filename];

      if (file instanceof fs.Stats) {
        if (EXTENSIONS.indexOf(path.extname(filename)) < 0)
          continue;

        if (file.size < 1024 * 1024)
          continue;

        tree[filename] = {
          isMedia: true,
          path: filepath,
          name: filename,
          size: file.size,
        };
      } else {
        const subtree = rec(file, filepath);

        if (Object.keys(subtree).length > 0)
          tree[filename] = subtree;
      }
    }

    return tree;
  };

  return rec(await walkDirectory(dir), dir);
};

const fetchMetadata = async title => {
  console.log('fetching metadata for "' + title + '"');

  const url = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${title}`;
  const res = await fetch(url);

  const json = await res.json();

  if (json.Response !== 'True') {
    console.log('failed:', json);
    return { imdbID: false };
  }

  json.dvd = json.DVD;
  delete json.DVD;
  delete json.Response;

  return Object.keys(json).reduce((o, k) => {
    o[k[0].toLowerCase() + k.slice(1)] = json[k] === 'N/A' ? null : json[k];
    return o;
  }, {});
};

const buildManifest = async (oldMan, tree) => {
  const manifest = {};

  const rec = async (files, basePath) => {
    const keys = Object.keys(files);

    for (let i = 0; i < keys.length; ++i) {
      const filename = keys[i];
      const filepath = [basePath, filename].join('/');

      if (files[filename].isMedia === true) {
        const media = oldMan[filepath] || {
          name: files[filename].name,
          path: files[filename].path,
          size: files[filename].size,
          imdbID: null,
        };

        if (media.imdbID === null) {
          const normalizedFilename = normalizeFilename(media.name);
          let metadata = await fetchMetadata(normalizedFilename);

          if (!metadata.imdbID) {
            const parent = path.basename(basePath);
            const normalizedParent = normalizeFilename(parent);
            const match = normalizedFilename.split(' ').filter(s => !!normalizedParent.match(s));

            if (normalizedParent !== normalizedFilename && match.length > 0)
              metadata = await fetchMetadata(normalizedParent);
          }

          Object.assign(media, metadata, { normalizedFilename });
        }

        manifest[filepath] = media;
        await fs.writeJson(MANIFEST_PATH, manifest);
      } else {
        await rec(files[filename], filepath);
      }
    }
  };

  await rec(tree, '');

  return manifest;
};

const getFiles = async () => {
  const tree = await filesTree(MEDIA_PATH);
  const oldMan = await fs.readJson(MANIFEST_PATH);
  const newMan = await buildManifest(oldMan, tree);

  return Object.values(newMan)
    .sort((a, b) => (a.title || a.normalizedFilename).localeCompare(b.title || b.normalizedFilename));
};

app.get('/', async (req, res, next) => {
  try {
    res.render('index', {
      basePath: MEDIA_PATH,
      files: await getFiles(),
    });
  } catch (e) {
    next(e);
  }
});

(async () => {
  try {
    try {
      await fs.access(MANIFEST_PATH, fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK);
    } catch (e) {
      if (e.code === 'ENOENT')
        await fs.writeJson(MANIFEST_PATH, {});
      else
        throw e;
    }

    const files = await getFiles();

    console.log(`${files.length} file(s) found`);
    console.log(`starting server on port ${PORT}`);
    app.listen(PORT);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();
