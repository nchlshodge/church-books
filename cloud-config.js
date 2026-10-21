// Which Firebase project the cloud version (index.html?cloud) talks to.
//   • On this computer it uses the local emulators (start them: cd Accounting/firebase && firebase emulators:start).
//   • Add &live to use the real project: index.html?cloud&live — the RCC Hub's project (bedsidercc). The books
//     live under their own collections (orgs/, bookUsers/, bookInvites/) and books* functions, and nothing in
//     the Hub links here.
(function () {
  const q = new URLSearchParams(location.search), local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const live = {   // public web config (the same one the Hub pages use)
    apiKey: 'AIzaSyDFX7_fLi82PqkSUK7mi4bRzOPF1efcAeE', authDomain: 'bedsidercc.firebaseapp.com', projectId: 'bedsidercc',
    storageBucket: 'bedsidercc.firebasestorage.app', messagingSenderId: '950958384975', appId: '1:950958384975:web:6f43dec5a7ba842c69c73a',
  };
  window.BOOKS_CLOUD_CONFIG = local && !q.has('live')
    ? { emulator: true, region: 'us-central1', ports: { auth: 9299, firestore: 8299, functions: 5299, storage: 9399 },
        firebase: { apiKey: 'demo-key', authDomain: 'demo-churchbooks.firebaseapp.com', projectId: 'demo-churchbooks', storageBucket: 'demo-churchbooks.appspot.com' } }
    : { emulator: false, region: 'us-central1', firebase: live };
})();
