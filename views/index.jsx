const React = require('react');

const ellipsis = str => str.length < 70 ? str : str.slice(0, 70) + '...';

const Media = ({
  name,
  path,
  title,
  imdbID,
  year,
  runtime,
  plot,
  imdbRating,
  poster,
}) => (!imdbID
  ? (
    <div className="media no-imdbid">
      <div className="title">{ ellipsis(name) }</div>
    </div>
  ) : (
    <div className="media">
      <div className="poster">
        { poster && <img src={poster} height="100%" alt={ title || name } />}
      </div>
      <div className="info">
        { imdbRating && <div className="rating">{ imdbRating } / 10</div> }
        { runtime && <div className="runtime">{ runtime }</div> }
        <div className="title">
          { ellipsis(title) }
          { year && <span className="year">({ year })</span> }
        </div>
        { plot && <div className="plot">{ plot }</div> }
        { path && <div className="path">{ path }</div> }
      </div>
    </div>
  )
);

export default ({ basePath, files }) => (
  <html>
    <head>
      <meta charSet="utf8" />
      <title>media: {basePath}</title>
      <link type="text/css" rel="stylesheet" href="/css/styles.css" />
      <link type="text/css" rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css" integrity="sha384-MCw98/SFnGE8fJT3GXwEOngsV7Zt27NXFoaoApmYm81iuXoPkFOJwJ8ERdknLPMO" crossOrigin="anonymous" />
    </head>

    <body>
      <div className="container">
        <h1>Media list</h1>
        { files.map(f => (
          <Media key={f.imdbID || f.name} {...f} />
        )) }
      </div>
    </body>
  </html>
);
