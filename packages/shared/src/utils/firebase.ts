import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCKQjAFbOKy1uYOsWMDUxMSvuOFyL9-0-U",
  authDomain: "alumaconnect-8465c.firebaseapp.com",
  projectId: "alumaconnect-8465c",
  storageBucket: "alumaconnect-8465c.firebasestorage.app",
  messagingSenderId: "988703408560",
  appId: "1:988703408560:web:0aa115f98a6e1b7ec19675",
  measurementId: "G-B49F0BQF3L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);