import ytdl from '@distube/ytdl-core';

export const config = {
  api: { responseLimit: false },
};

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing video id' });

  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });
    if (!format) return res.status(404).json({ error: 'No audio format found' });

    const headers = {};
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const upstream = await fetch(format.url, { headers });

    res.setHeader('Content-Type', format.mimeType || 'audio/webm');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (upstream.headers.get('content-length')) {
      res.setHeader('Content-Length', upstream.headers.get('content-length'));
    }
    if (upstream.headers.get('content-range')) {
      res.setHeader('Content-Range', upstream.headers.get('content-range'));
    }

    res.status(upstream.status);

    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        const ok = res.write(value);
        if (!ok) await new Promise(resolve => res.once('drain', resolve));
      }
    };
    await pump();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
}
