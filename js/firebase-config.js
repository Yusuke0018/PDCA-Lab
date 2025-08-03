// Firebase設定
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE", // APIキーはFirebase Consoleから取得してください
  authDomain: "pdca-lab.firebaseapp.com",
  projectId: "pdca-lab",
  storageBucket: "pdca-lab.firebasestorage.app",
  messagingSenderId: "222821808402",
  appId: "1:222821808402:web:2269abd2453d28c4625bcb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

console.log('Firebase initialized successfully!');