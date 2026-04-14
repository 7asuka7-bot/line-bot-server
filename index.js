const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const USER_ID = process.env.LINE_USER_ID;

async function sendLineMessage(message) {
  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to: USER_ID,
      messages: [{ type: 'text', text: message }]
    },
    {
      headers: {
        'Authorization': `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await sendLineMessage(`受け取りました：${event.message.text}`);
    }
  }
});

app.post('/send', async (req, res) => {
  try {
    const { message } = req.body;
    await sendLineMessage(message || '今日のタスク確認の時間です！');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'メッセージ送信失敗' });
  }
});

app.get('/', (req, res) => {
  res.send('LINEボットサーバー 起動中 ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバー起動中: ポート${PORT}`);
});
