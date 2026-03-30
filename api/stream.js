import ytdl from 'ytdl-core';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing video id' });

  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    // Pick best audio-only format
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });
    if (!format) return res.status(404).json({ error: 'No audio format found' });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ url: format.url, mimeType: format.mimeType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
