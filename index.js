const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const OWNER_ID = process.env.LINE_USER_ID;
const LINE_API = 'https://api.line.me/v2/bot/message';

// 予約フロー状態管理（メモリ上）
const bookingState = new Map();

// ================== LINE API ==================

async function replyMessage(replyToken, messages) {
  await axios.post(
    `${LINE_API}/reply`,
    { replyToken, messages: Array.isArray(messages) ? messages : [messages] },
    { headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' } }
  );
}

async function pushMessage(to, messages) {
  await axios.post(
    `${LINE_API}/push`,
    { to, messages: Array.isArray(messages) ? messages : [messages] },
    { headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' } }
  );
}

async function broadcastMessage(messages) {
  await axios.post(
    `${LINE_API}/broadcast`,
    { messages: Array.isArray(messages) ? messages : [messages] },
    { headers: { Authorization: `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' } }
  );
}

function text(str) {
  return { type: 'text', text: str };
}

function quickReply(message, items) {
  return {
    ...text(message),
    quickReply: {
      items: items.map(([label, msg]) => ({
        type: 'action',
        action: { type: 'message', label, text: msg }
      }))
    }
  };
}

// ================== 各機能 ==================

// サロン情報（名刺がわり）
function buildBusinessCard() {
  return {
    type: 'flex',
    altText: 'よもぎとハーブ サロン情報',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '🌿 よもぎとハーブ', weight: 'bold', size: 'xl' },
          { type: 'text', text: 'よもぎ蒸し・フットケアサロン', size: 'sm', color: '#888888' },
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
            contents: [
              { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                { type: 'text', text: '営業時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                { type: 'text', text: '10:00〜18:00', wrap: true, size: 'sm', flex: 5 }
              ]},
              { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                { type: 'text', text: '定休日', color: '#aaaaaa', size: 'sm', flex: 2 },
                { type: 'text', text: '不定休（要確認）', wrap: true, size: 'sm', flex: 5 }
              ]}
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'primary', color: '#5C8A6E',
            action: { type: 'message', label: '予約する', text: '予約したい' }
          },
          {
            type: 'button', style: 'secondary',
            action: { type: 'message', label: 'メニュー・料金を見る', text: 'メニューを見せて' }
          }
        ]
      }
    }
  };
}

// メニュー・料金
function buildMenu() {
  return text(
    `🌿 よもぎとハーブ メニュー\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `🫧 よもぎ蒸し\n` +
    `  60分 ¥5,000\n` +
    `  90分 ¥7,000\n\n` +
    `🦶 フットケア\n` +
    `  45分 ¥4,000\n` +
    `  60分 ¥5,500\n\n` +
    `✨ セット（よもぎ蒸し＋フットケア）\n` +
    `  120分 ¥10,000\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `ご予約は「予約したい」と送ってください`
  );
}

// 予約開始
async function startBooking(userId, replyToken) {
  bookingState.set(userId, { step: 1 });
  await replyMessage(replyToken, quickReply(
    '予約のご希望ありがとうございます🌿\n\n希望日を教えてください（例：6月15日）',
    [['今週希望', '今週希望'], ['来週希望', '来週希望'], ['キャンセル', 'キャンセル']]
  ));
}

// 予約フロー処理
async function handleBookingFlow(userId, replyToken, inputText) {
  const state = bookingState.get(userId);

  if (inputText === 'キャンセル') {
    bookingState.delete(userId);
    return replyMessage(replyToken, text('予約を取り消しました。またいつでもどうぞ🌿'));
  }

  if (state.step === 1) {
    bookingState.set(userId, { step: 2, date: inputText });
    return replyMessage(replyToken, quickReply(
      `${inputText}ですね！\n\n希望のお時間を教えてください（例：10時、14時）`,
      [['午前（10〜12時）', '午前希望'], ['午後（13〜17時）', '午後希望']]
    ));
  }

  if (state.step === 2) {
    bookingState.set(userId, { step: 3, date: state.date, time: inputText });
    return replyMessage(replyToken, quickReply(
      `${state.date} ${inputText}ですね！\n\nご希望のメニューを選んでください`,
      [
        ['よもぎ蒸し 60分', 'よもぎ蒸し60分 ¥5,000'],
        ['よもぎ蒸し 90分', 'よもぎ蒸し90分 ¥7,000'],
        ['フットケア 45分', 'フットケア45分 ¥4,000'],
        ['フットケア 60分', 'フットケア60分 ¥5,500'],
        ['セット 120分', 'よもぎ蒸し＋フットケアセット ¥10,000']
      ]
    ));
  }

  if (state.step === 3) {
    const { date, time } = state;
    bookingState.delete(userId);

    // オーナーへ通知
    await pushMessage(OWNER_ID, text(
      `📅 新しい予約リクエストが届きました\n\n` +
      `日時：${date} ${time}\n` +
      `メニュー：${inputText}\n\n` +
      `確認してお客様にご連絡ください`
    ));

    return replyMessage(replyToken, text(
      `ご予約リクエストを受け付けました🌿\n\n` +
      `📅 ${date} ${time}\n` +
      `🌿 ${inputText}\n\n` +
      `確認後、こちらからご連絡いたします。\nしばらくお待ちください✨`
    ));
  }
}

// デフォルト返信
function buildDefault() {
  return quickReply(
    'こんにちは🌿 よもぎとハーブです\n\n以下からご案内できます：',
    [
      ['メニュー・料金', 'メニューを見せて'],
      ['予約する', '予約したい'],
      ['サロン情報', 'サロン情報を見せて']
    ]
  );
}

// ================== Webhook ==================

app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  const events = req.body.events;
  if (!events) return;

  for (const event of events) {
    try {
      // 友達追加
      if (event.type === 'follow') {
        await pushMessage(event.source.userId, text(
          'フォローありがとうございます🌿\nよもぎとハーブです。\n\nよもぎ蒸し・フットケアのサロンです。\n\n「メニュー」「予約したい」と送っていただくとご案内できます！'
        ));
        continue;
      }

      if (event.type !== 'message' || event.message.type !== 'text') continue;

      const inputText = event.message.text.trim();
      const userId = event.source.userId;
      const { replyToken } = event;

      // 予約フロー中
      if (bookingState.has(userId)) {
        await handleBookingFlow(userId, replyToken, inputText);
        continue;
      }

      // キーワード振り分け
      if (inputText.includes('予約')) {
        await startBooking(userId, replyToken);
      } else if (inputText.includes('メニュー') || inputText.includes('料金') || inputText.includes('値段')) {
        await replyMessage(replyToken, buildMenu());
      } else if (inputText.includes('サロン情報') || inputText.includes('名刺') || inputText.includes('はじめまして')) {
        await replyMessage(replyToken, buildBusinessCard());
      } else {
        await replyMessage(replyToken, buildDefault());
      }

    } catch (err) {
      console.error('エラー:', err.response?.data || err.message);
    }
  }
});

// ================== 管理API ==================

// 一斉送信
app.post('/broadcast', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'messageが必要です' });
    await broadcastMessage(text(message));
    res.status(200).json({ success: true, message: '一斉送信完了' });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: '送信失敗' });
  }
});

// 個別送信（タスクリマインダー等）
app.post('/send', async (req, res) => {
  try {
    const { message, userId } = req.body;
    const target = userId || OWNER_ID;
    await pushMessage(target, text(message || '今日のタスク確認の時間です！'));
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: '送信失敗' });
  }
});

app.get('/', (req, res) => {
  res.send('よもぎとハーブ LINEボット 起動中 🌿');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバー起動中: ポート${PORT}`);
});
