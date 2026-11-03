// RR AI Quiz Platform V2 前端設定（這些都不是機密，可以放在公開 repo；安全由 Firestore 權限規則把關）
window.RRQP_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyC9NaA2XmLgWVlfHFRL5u1n-gPlIwY-6A0',
    authDomain: 'rr-ai-quiz-platform-83040.firebaseapp.com',
    projectId: 'rr-ai-quiz-platform-83040',
    storageBucket: 'rr-ai-quiz-platform-83040.firebasestorage.app',
    messagingSenderId: '291339443871',
    appId: '1:291339443871:web:72c3eba1cd6b02d3b94caa',
  },
  // 第一位 TW 講師（也寫在 firestore.rules 裡）；其他講師在「主題設定 → 講師名單」新增
  OWNER: 'chris.chouyh@shopee.com',
};
