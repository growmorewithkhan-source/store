/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Home, 
  ShoppingCart, 
  Package, 
  Wallet, 
  Users, 
  BarChart3, 
  Camera, 
  X, 
  Edit2, 
  Trash2, 
  LogOut, 
  ShieldCheck, 
  CloudUpload,
  Cloud,
  RefreshCw,
  Search,
  Plus,
  Minus,
  Printer,
  History,
  Mail,
  Facebook,
  MessageSquare,
  Send,
  CheckCircle,
  Smartphone,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { Html5Qrcode } from 'html5-qrcode';
import { cn } from './lib/utils';

// --- Firebase ---
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  User,
  signInAnonymously
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy,
  getDoc
} from 'firebase/firestore';

// --- Types ---

interface Product {
  name: string;
  price: number;
  qty: number;
  barcode: string;
}

interface SaleItem extends Product {
  count: number;
  sIdx: number;
}

interface Sale {
  total: number;
  date: string;
  time: string;
  items: SaleItem[];
}

interface Expense {
  title: string;
  amt: number;
  date: string;
}

interface Khata {
  name: string;
  due: number;
  date: string;
  phone: string;
  description: string;
  status?: 'unpaid' | 'paid';
}

interface AppData {
  stock: Product[];
  sales: Sale[];
  expenses: Expense[];
  khata: Khata[];
}

type Screen = 'dash' | 'pos' | 'inv' | 'acc' | 'khata' | 'reports';

// --- Constants ---

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxKQxjaj2cUsCrhxhPAcbYMYbHPSbDnXoJ3AG0yI1bgCnMWbXq7aZdZDbnUHSz9WUeT/exec";
const SHEET_ID = "1iEVlp5UloulX2gzNVu0wwzS7BkcBLZvTCAi_Vh5fvg4";
const CORRECT_PIN = "1234";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeScreen, setActiveScreen] = useState<Screen>('dash');
  const [messageModal, setMessageModal] = useState<{ khata: Khata; isPaid: boolean } | null>(null);
  const [data, setData] = useState<AppData>({ stock: [], sales: [], expenses: [], khata: [] });
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Form states
  const [productForm, setProductForm] = useState<{ name: string; price: string; qty: string; idx: number | null }>({ name: '', price: '', qty: '', idx: null });
  const [expenseForm, setExpenseForm] = useState<{ title: string; amt: string; idx: number | null }>({ title: '', amt: '', idx: null });
  const [khataForm, setKhataForm] = useState<{ name: string; due: string; phone: string; description: string; idx: number | null }>({ name: '', due: '', phone: '', description: '', idx: null });
  
  // Search states
  const [posSearch, setPosSearch] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toLocaleDateString('en-CA'));

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // --- Stats Logic ---

  const stats = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todaySales = data.sales.filter(s => s.date === todayStr).reduce((a, b) => a + b.total, 0);
    const todayExp = data.expenses.filter(e => e.date === todayStr).reduce((a, b) => a + b.amt, 0);
    const totalKhata = data.khata.reduce((a, b) => a + b.due, 0);
    return {
      sales: todaySales,
      exp: todayExp,
      profit: todaySales - todayExp,
      khata: totalKhata
    };
  }, [data]);

  const cartTotal = useMemo(() => cart.reduce((a, b) => a + (b.price * b.count), 0), [cart]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Firebase Auth ---

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        setIsLoggedIn(true);
      }
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      showToast("Logged in with Google!", "success");
    } catch (e) {
      console.error("Login error:", e);
      showToast("Failed to login with Google", "error");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsLoggedIn(false);
      setUser(null);
      setPin('');
      showToast("Logged out successfully", "success");
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  const handleLogin = async () => {
    if (pin === CORRECT_PIN) {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        setIsLoggedIn(true);
        setLoginError(false);
        showToast("System Unlocked!", "success");
      } catch (e: any) {
        console.error("Auth error:", e);
        if (e.code === 'auth/operation-not-allowed') {
          showToast("Anonymous login disabled in Firebase Console", "error");
        } else {
          showToast("Failed to authenticate: " + (e.message || "Unknown error"), "error");
        }
      }
    } else {
      setLoginError(true);
    }
  };

  // --- Firestore Sync ---

  useEffect(() => {
    if (!user) return;

    setIsSyncing(true);
    
    const unsubStock = onSnapshot(collection(db, 'stock'), (snap) => {
      const stock = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      setData(prev => ({ ...prev, stock }));
    });

    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('date', 'desc')), (snap) => {
      const sales = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      setData(prev => ({ ...prev, sales }));
    });

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), (snap) => {
      const expenses = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      setData(prev => ({ ...prev, expenses }));
    });

    const unsubKhata = onSnapshot(collection(db, 'khata'), (snap) => {
      const khata = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      setData(prev => ({ ...prev, khata }));
      setIsSyncing(false);
    });

    return () => {
      unsubStock();
      unsubSales();
      unsubExpenses();
      unsubKhata();
    };
  }, [user]);

  // --- Inventory Logic ---

  const saveProduct = async () => {
    const { name, price, qty, idx } = productForm;
    const p = parseFloat(price);
    const q = parseInt(qty);
    if (!name || isNaN(p)) return;

    try {
      if (idx !== null) {
        const productId = (data.stock[idx] as any).id;
        await setDoc(doc(db, 'stock', productId), { name, price: p, qty: q, barcode: name });
      } else {
        const existing = data.stock.find(item => item.name.toLowerCase() === name.toLowerCase() && item.price === p);
        if (existing) {
          await setDoc(doc(db, 'stock', (existing as any).id), { ...existing, qty: existing.qty + q });
        } else {
          await addDoc(collection(db, 'stock'), { name, price: p, qty: q, barcode: name });
        }
      }
      setProductForm({ name: '', price: '', qty: '', idx: null });
      showToast("Product saved!", "success");
    } catch (e) {
      console.error("Save product error:", e);
      showToast("Failed to save product", "error");
    }
  };

  const deleteItem = (key: keyof AppData, idx: number) => {
    const item = data[key][idx] as any;
    setConfirmModal({
      show: true,
      title: "Delete Confirmation",
      message: "Are you sure you want to delete this item? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, key, item.id));
          setConfirmModal(null);
          showToast("Item deleted successfully", "success");
        } catch (e) {
          console.error("Delete error:", e);
          showToast("Failed to delete item", "error");
        }
      }
    });
  };

  // --- POS Logic ---

  const addToCart = async (idx: number) => {
    const product = data.stock[idx];
    if (product.qty > 0) {
      const newCart = [...cart];
      const existing = newCart.find(c => c.name === product.name);
      if (existing) {
        existing.count++;
      } else {
        newCart.push({ ...product, count: 1, sIdx: idx });
      }
      
      try {
        await setDoc(doc(db, 'stock', (product as any).id), { ...product, qty: product.qty - 1 });
        setCart(newCart);
      } catch (e) {
        console.error("Add to cart error:", e);
        showToast("Failed to update stock", "error");
      }
    }
  };

  const removeFromCart = async (idx: number) => {
    const item = cart[idx];
    const product = data.stock[item.sIdx];
    try {
      await setDoc(doc(db, 'stock', (product as any).id), { ...product, qty: product.qty + item.count });
      const newCart = [...cart];
      newCart.splice(idx, 1);
      setCart(newCart);
    } catch (e) {
      console.error("Remove from cart error:", e);
      showToast("Failed to update stock", "error");
    }
  };

  const handlePrint = async (reprintSale?: Sale) => {
    const items = reprintSale ? reprintSale.items : cart;
    const total = reprintSale ? reprintSale.total : cartTotal;
    
    if (items.length === 0) return;

    const win = window.open('', '_blank');
    if (!win) {
      showToast("Pop-up blocked! Please allow pop-ups to print.", "error");
      return;
    }

    win.document.write(`
      <html>
        <head>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 72mm; 
              padding: 5mm; 
              font-size: 14px; 
              color: #000;
              line-height: 1.4;
              margin: 0;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .uppercase { text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th { border-bottom: 1px solid #000; padding: 8px 0; font-weight: bold; font-size: 14px; }
            td { padding: 8px 0; vertical-align: top; font-size: 14px; }
            .dashed-border { border-bottom: 1px dashed #000; }
            .solid-border-top { border-top: 1.5px solid #000; }
            .solid-border-bottom { border-bottom: 1.5px solid #000; }
            .total-row { font-weight: bold; font-size: 16px; padding: 10px 0; }
            hr { border: none; border-top: 1px solid #000; margin: 5px 0; }
            .footer { margin-top: 20px; font-size: 12px; }
            .dev-footer { margin-top: 30px; font-weight: bold; text-align: center; font-size: 12px; }
            .line-separator { border-top: 1px solid #000; margin: 2px 0; }
          </style>
        </head>
        <body>
          <div class="center bold uppercase" style="font-size: 20px; margin-bottom: 10px;">
            SOHAIL SUPER STORE
          </div>
          <div class="center" style="margin-bottom: 15px; font-size: 14px;">
          </div>
          
          <div class="line-separator"></div>
          <div class="center uppercase" style="letter-spacing: 4px; padding: 5px 0; font-size: 14px;">
            INVOICE ${reprintSale ? '(RE-PRINT)' : ''}
          </div>
          <div class="line-separator"></div>

          <table>
            <thead>
              <tr class="uppercase">
                <th align="left">ITEM</th>
                <th align="center">QTY</th>
                <th align="right">RATE</th>
                <th align="right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((c, idx) => `
                <tr class="${idx < items.length - 1 ? 'dashed-border' : ''}">
                  <td align="left">${c.name.toUpperCase()}</td>
                  <td align="center">${c.count}</td>
                  <td align="right">${c.price}</td>
                  <td align="right">${c.price * c.count}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="solid-border-top total-row" style="display:flex; justify-content:space-between; align-items: center;">
            <span class="uppercase">NET TOTAL:</span>
            <span style="font-size: 18px;">RS. ${total}.00</span>
          </div>

          <div class="footer">
            <div class="bold uppercase" style="margin-bottom: 5px; text-decoration: underline;">TERMS & CONDITIONS:</div>
            <div>1. No Cash Refund.</div>
            <div>2. Same day exchange for food.</div>
            <div>3. Opened packs not accepted.</div>
            <div>4. Receipt mandatory.</div>
          </div>

          <div class="dev-footer uppercase" style="letter-spacing: 1px;">
            DEVELOPED BY: SHAHAN ULLAH
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();

    if (!reprintSale) {
      const newSale: Sale = {
        total: cartTotal,
        date: new Date().toLocaleDateString('en-CA'),
        time: new Date().toLocaleTimeString(),
        items: [...cart]
      };
      addDoc(collection(db, 'sales'), newSale).catch(e => console.error("Sale save error:", e));
      setCart([]);
    }
  };

  // --- Scanner Logic ---

  const startScanner = async () => {
    setShowScanner(true);
    setTimeout(async () => {
      scannerRef.current = new Html5Qrcode("reader");
      try {
        await scannerRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (text) => {
            const existing = data.stock.find(p => p.barcode === text || p.name === text);
            setProductForm(prev => ({
              ...prev,
              name: existing ? existing.name : text,
              price: existing ? existing.price.toString() : prev.price
            }));
            stopScanner();
          },
          () => {}
        );
      } catch (err) {
        console.error(err);
        setShowScanner(false);
      }
    }, 100);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
    setShowScanner(false);
  };

  // --- Other Logic ---

  const saveExpense = async () => {
    const { title, amt, idx } = expenseForm;
    const a = parseFloat(amt);
    if (!title || isNaN(a)) return;

    try {
      const expense = { title, amt: a, date: new Date().toLocaleDateString('en-CA') };
      if (idx !== null) {
        await setDoc(doc(db, 'expenses', (data.expenses[idx] as any).id), expense);
      } else {
        await addDoc(collection(db, 'expenses'), expense);
      }
      setExpenseForm({ title: '', amt: '', idx: null });
      showToast("Expense saved!", "success");
    } catch (e) {
      console.error("Save expense error:", e);
      showToast("Failed to save expense", "error");
    }
  };

  const saveKhata = async () => {
    const { name, due, phone, description, idx } = khataForm;
    const d = parseFloat(due);
    if (!name || isNaN(d)) return;

    try {
      const khata: Khata = { 
        name, 
        due: d, 
        phone, 
        description, 
        date: new Date().toLocaleDateString('en-CA'),
        status: 'unpaid'
      };
      if (idx !== null) {
        await setDoc(doc(db, 'khata', (data.khata[idx] as any).id), khata);
      } else {
        await addDoc(collection(db, 'khata'), khata);
      }
      setKhataForm({ name: '', due: '', phone: '', description: '', idx: null });
      showToast("Khata saved successfully", "success");
    } catch (e) {
      console.error("Save khata error:", e);
      showToast("Failed to save khata", "error");
    }
  };

  const markKhataPaid = async (idx: number) => {
    const khata = { ...data.khata[idx] };
    const originalDue = khata.due;
    khata.status = 'paid';
    khata.due = 0;
    
    try {
      await setDoc(doc(db, 'khata', (khata as any).id), khata);
      // Show message options modal
      const messageKhata = { ...khata, due: originalDue };
      setTimeout(() => {
        setMessageModal({ khata: messageKhata, isPaid: true });
      }, 100);
      showToast("Khata marked as PAID", "success");
    } catch (e) {
      console.error("Mark paid error:", e);
      showToast("Failed to mark as paid", "error");
    }
  };

  const sendKhataMessage = (khata: Khata, isPaid: boolean = false, type: 'sms' | 'whatsapp') => {
    const message = isPaid 
      ? `SOHAIL SUPER STORE:\nDear ${khata.name}, your payment of Rs. ${khata.due} has been RECEIVED. Your balance is now 0. Thank you!`
      : `SOHAIL SUPER STORE:\nDear ${khata.name}, your balance due is Rs. ${khata.due}.\nDescription: ${khata.description || 'N/A'}\nPlease clear your dues.`;
    
    const phone = khata.phone ? String(khata.phone).replace(/[^0-9]/g, '') : '';
    if (!phone) {
      showToast("No phone number provided", "error");
      return;
    }
    
    if (type === 'whatsapp') {
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
    } else {
      const smsUrl = `sms:${phone}${window.navigator.userAgent.match(/iPhone/i) ? '&' : '?'}body=${encodeURIComponent(message)}`;
      window.open(smsUrl, '_blank');
    }
    setMessageModal(null);
  };

  const syncToCloudOld = async () => {
    // Old implementation removed in favor of Google Sheets API
  };

  // --- Render Helpers ---

  if (!isAuthReady) {
    return (
      <div className="fixed inset-0 bg-bg flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-brand animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Initializing System...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="fixed inset-0 bg-bg z-[2000] flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card p-10 rounded-[30px] border border-brand text-center w-full max-w-[400px] shadow-[0_0_30px_rgba(99,102,241,0.3)]"
        >
          <ShieldCheck className="w-16 h-16 text-brand mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-6">Sohail Super Store</h2>
          
          <div className="space-y-4">
            <div className="bg-[#0d1117] border border-[#30363d] p-4 rounded-xl">
              <p className="text-sm text-[#8b949e] mb-2">Login with Google to Sync Data</p>
              <button 
                onClick={handleGoogleLogin} 
                className="w-full p-4 rounded-xl bg-white text-black font-bold flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <LogIn className="w-5 h-5" /> Sign in with Google
              </button>
            </div>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-[#30363d]"></span></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-[#8b949e]">Or use PIN</span></div>
            </div>

            <input 
              type="password" 
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN" 
              className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none text-center text-2xl tracking-[10px]"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button onClick={handleLogin} className="w-full p-4 rounded-xl bg-linear-to-br from-brand to-[#a855f7] text-white font-extrabold transition-all active:scale-95">
              UNLOCK SYSTEM
            </button>
          </div>
          {loginError && <p className="text-danger text-sm mt-4">Invalid PIN!</p>}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-[#f0f6fc]">
      {/* Modals */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 20 }}
            exit={{ opacity: 0, y: -50 }}
            className={cn(
              "fixed top-0 left-1/2 -translate-x-1/2 z-[7000] px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2",
              toast.type === 'success' ? "bg-success text-white" : "bg-danger text-white"
            )}
          >
            {toast.type === 'success' ? <ShieldCheck className="w-5 h-5" /> : <X className="w-5 h-5" />}
            {toast.message}
          </motion.div>
        )}

        {confirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[6500] flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-card p-8 rounded-[25px] border border-brand w-full max-w-[400px] text-center shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-4">{confirmModal.title}</h3>
              <p className="text-[#8b949e] mb-8">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 p-4 rounded-xl bg-[#30363d] text-white font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 p-4 rounded-xl bg-danger text-white font-bold"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showScanner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[6000] flex flex-col items-center justify-center"
          >
            <div id="reader" className="w-[300px] bg-white rounded-2xl overflow-hidden shadow-2xl"></div>
            <button onClick={stopScanner} className="mt-8 px-8 py-4 rounded-xl bg-danger text-white font-bold flex items-center gap-2">
              <X className="w-5 h-5" /> CLOSE CAMERA
            </button>
          </motion.div>
        )}

        {messageModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 z-[5000] flex items-center justify-center backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="bg-card p-8 rounded-[25px] border border-brand w-full max-w-[400px] text-center shadow-[0_0_50px_rgba(99,102,241,0.4)]"
            >
              <h3 className="text-xl font-bold mb-6 text-white">Send Message</h3>
              <p className="text-sm text-[#8b949e] mb-6">Choose how you want to send the {messageModal.isPaid ? 'payment confirmation' : 'due reminder'} to {messageModal.khata.name}.</p>
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => sendKhataMessage(messageModal.khata, messageModal.isPaid, 'whatsapp')} 
                  className="flex items-center justify-center gap-3 p-4 rounded-xl bg-[#25d366] hover:bg-[#20ba5a] text-white font-bold transition-all active:scale-95 shadow-lg"
                >
                  <MessageSquare className="w-5 h-5" /> WhatsApp
                </button>
                <button 
                  onClick={() => sendKhataMessage(messageModal.khata, messageModal.isPaid, 'sms')} 
                  className="flex items-center justify-center gap-3 p-4 rounded-xl bg-brand hover:bg-brand/80 text-white font-bold transition-all active:scale-95 shadow-lg"
                >
                  <Smartphone className="w-5 h-5" /> Simple SMS
                </button>
                <button 
                  onClick={() => setMessageModal(null)} 
                  className="w-full p-4 rounded-xl bg-[#30363d] hover:bg-[#3d444d] text-white font-bold mt-4 transition-all active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDevModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 z-[5000] flex items-center justify-center backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="bg-card p-8 rounded-[25px] border border-brand w-full max-w-[400px] text-center shadow-[0_0_50px_rgba(99,102,241,0.4)]"
            >
              <h3 className="text-xl font-bold mb-6 text-white">Contact Developer</h3>
              <div className="space-y-3">
                <a 
                  href="mailto:shahanullah@imsciences.edu.pk" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="flex items-center justify-center gap-3 p-4 rounded-xl bg-[#ea4335] hover:bg-[#d33828] text-white font-bold transition-all active:scale-95 shadow-lg"
                >
                  <Mail className="w-5 h-5" /> Gmail
                </a>
                <a 
                  href="https://facebook.com/shahanullah890" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="flex items-center justify-center gap-3 p-4 rounded-xl bg-[#1877f2] hover:bg-[#166fe5] text-white font-bold transition-all active:scale-95 shadow-lg"
                >
                  <Facebook className="w-5 h-5" /> Facebook
                </a>
                <button 
                  onClick={() => setShowDevModal(false)} 
                  className="w-full p-4 rounded-xl bg-[#30363d] hover:bg-[#3d444d] text-white font-bold mt-4 transition-all active:scale-95"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto no-scrollbar pb-28">
        <AnimatePresence mode="wait">
          {activeScreen === 'dash' && (
            <motion.div 
              key="dash"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-extrabold">Sohail Super Store</h2>
                <div className="text-xs text-[#4ade80] font-bold flex items-center gap-2">
                  {isSyncing ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-brand" />
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="live-dot"></span>
                      <RefreshCw className="w-3 h-3 text-[#8b949e] opacity-50" />
                    </div>
                  )}
                  {isSyncing ? "Syncing..." : "Online"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1c2128] p-5 rounded-2xl border border-[#30363d] flex flex-col items-center justify-center s-sales">
                  <BarChart3 className="w-8 h-8 text-success mb-3" />
                  <small className="text-[#8b949e]">Today's Sales</small>
                  <h2 className="text-xl font-bold">Rs. {stats.sales}</h2>
                </div>
                <div className="bg-[#1c2128] p-5 rounded-2xl border border-[#30363d] flex flex-col items-center justify-center s-exp">
                  <Wallet className="w-8 h-8 text-danger mb-3" />
                  <small className="text-[#8b949e]">Today's Exp</small>
                  <h2 className="text-xl font-bold">Rs. {stats.exp}</h2>
                </div>
                <div className="bg-[#1c2128] p-5 rounded-2xl border border-[#30363d] flex flex-col items-center justify-center s-profit">
                  <ShieldCheck className="w-8 h-8 text-brand mb-3" />
                  <small className="text-[#8b949e]">Today's Profit</small>
                  <h2 className="text-xl font-bold">Rs. {stats.profit}</h2>
                </div>
                <div className="bg-[#1c2128] p-5 rounded-2xl border border-[#30363d] flex flex-col items-center justify-center s-khata">
                  <Users className="w-8 h-8 text-warning mb-3" />
                  <small className="text-[#8b949e]">Total Khata</small>
                  <h2 className="text-xl font-bold">Rs. {stats.khata}</h2>
                </div>
              </div>

              <div className="bg-card rounded-[22px] p-5 border border-[#30363d]">
                <h4 className="font-bold mb-2">Store Address & Contact</h4>
                <p className="text-xs text-[#8b949e] mb-4">Sango Landi Bala Peshawar</p>
                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={() => setShowDevModal(true)} 
                    className="p-4 rounded-xl bg-linear-to-r from-[#6366f1] to-[#a855f7] hover:from-[#5a5ef0] hover:to-[#9e4ef0] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
                  >
                    <ShieldCheck className="w-5 h-5" /> DEV CONTACT
                  </button>
                  <button onClick={handleLogout} className="p-4 rounded-xl bg-danger/20 text-danger border border-danger/30 text-sm font-bold flex items-center justify-center gap-2">
                    <LogOut className="w-5 h-5" /> LOGOUT
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeScreen === 'pos' && (
            <motion.div 
              key="pos"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-card rounded-[22px] p-5 border border-[#30363d]">
                <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b949e]" />
                  <input 
                    type="text" 
                    placeholder="Search Items..." 
                    value={posSearch}
                    onChange={(e) => setPosSearch(e.target.value)}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 pl-12 rounded-xl w-full outline-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {data.stock
                    .filter(p => p.name.toLowerCase().includes(posSearch.toLowerCase()))
                    .map((p, idx) => (
                      <button 
                        key={idx}
                        onClick={() => addToCart(data.stock.indexOf(p))}
                        className="bg-[#1c2128] p-3 rounded-xl border border-[#30363d] text-center active:scale-95 transition-transform"
                      >
                        <b className="text-sm block truncate">{p.name}</b>
                        <small className="text-brand block">Rs. {p.price}</small>
                        <small className="text-xs text-[#8b949e]">Stock: {p.qty}</small>
                      </button>
                    ))}
                </div>
              </div>

              <div className="bg-card rounded-[22px] p-5 border border-[#30363d]">
                <h4 className="font-bold mb-4 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" /> Cart
                </h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar">
                  {cart.map((c, i) => (
                    <div key={i} className="flex justify-between items-center p-3 border-b border-[#21262d]">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">{c.name}</span>
                        <span className="text-xs text-[#8b949e]">Rs. {c.price} x {c.count}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold">Rs. {c.price * c.count}</span>
                        <button onClick={() => removeFromCart(i)} className="text-danger">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#30363d]">
                  <div className="flex flex-col">
                    <span className="text-xs text-[#8b949e]">Total Amount</span>
                    <h2 className="text-2xl font-extrabold text-brand">Rs. {cartTotal}</h2>
                  </div>
                  <button onClick={() => handlePrint()} className="px-8 py-4 rounded-xl bg-linear-to-br from-brand to-[#a855f7] text-white font-extrabold shadow-lg active:scale-95 transition-transform">
                    PRINT BILL
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeScreen === 'inv' && (
            <motion.div 
              key="inv"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-card rounded-[22px] p-5 border border-[#30363d]">
                <h3 className="text-xl font-bold mb-4">Inventory Management</h3>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Product Name / Barcode" 
                      value={productForm.name}
                      onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl flex-1 outline-none"
                    />
                    <button onClick={startScanner} className="bg-brand text-white p-4 rounded-xl">
                      <Camera className="w-6 h-6" />
                    </button>
                  </div>
                  <input 
                    type="number" 
                    placeholder="Price" 
                    value={productForm.price}
                    onChange={(e) => setProductForm(prev => ({ ...prev, price: e.target.value }))}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none"
                  />
                  <input 
                    type="number" 
                    placeholder="Quantity" 
                    value={productForm.qty}
                    onChange={(e) => setProductForm(prev => ({ ...prev, qty: e.target.value }))}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none"
                  />
                  <button onClick={saveProduct} className="w-full p-4 rounded-xl bg-brand text-white font-bold">
                    {productForm.idx !== null ? 'UPDATE PRODUCT' : 'SAVE PRODUCT'}
                  </button>
                </div>
              </div>

              <div className="bg-card rounded-[22px] overflow-hidden border border-[#30363d]">
                <table className="w-full text-left">
                  <thead className="bg-[#1c2128] text-brand">
                    <tr>
                      <th className="p-4 text-xs font-extrabold uppercase">Product</th>
                      <th className="p-4 text-xs font-extrabold uppercase">Price</th>
                      <th className="p-4 text-xs font-extrabold uppercase text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262d]">
                    {data.stock.map((p, i) => (
                      <tr key={i}>
                        <td className="p-4">
                          <div className="font-bold">{p.name}</div>
                          <div className="text-xs text-[#8b949e]">Qty: {p.qty}</div>
                        </td>
                        <td className="p-4 text-sm font-bold">Rs. {p.price}</td>
                        <td className="p-4 text-right space-x-3">
                          <button onClick={() => setProductForm({ name: p.name, price: p.price.toString(), qty: p.qty.toString(), idx: i })} className="text-warning">
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => deleteItem('stock', i)} className="text-danger">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeScreen === 'acc' && (
            <motion.div 
              key="acc"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-card rounded-[22px] p-5 border border-[#30363d]">
                <h3 className="text-xl font-bold mb-4">Expenses</h3>
                <div className="space-y-3">
                  <input 
                    type="text" 
                    placeholder="Reason" 
                    value={expenseForm.title}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, title: e.target.value }))}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none"
                  />
                  <input 
                    type="number" 
                    placeholder="Amount" 
                    value={expenseForm.amt}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, amt: e.target.value }))}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none"
                  />
                  <button onClick={saveExpense} className="w-full p-4 rounded-xl bg-danger text-white font-bold">
                    {expenseForm.idx !== null ? 'UPDATE EXPENSE' : 'SAVE EXPENSE'}
                  </button>
                </div>
              </div>

              <div className="bg-card rounded-[22px] overflow-hidden border border-[#30363d]">
                <table className="w-full text-left">
                  <thead className="bg-[#1c2128] text-brand">
                    <tr>
                      <th className="p-4 text-xs font-extrabold uppercase">Reason</th>
                      <th className="p-4 text-xs font-extrabold uppercase">Amount</th>
                      <th className="p-4 text-xs font-extrabold uppercase text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262d]">
                    {data.expenses.map((e, i) => (
                      <tr key={i}>
                        <td className="p-4">
                          <div className="font-bold">{e.title}</div>
                          <div className="text-xs text-[#8b949e]">{e.date}</div>
                        </td>
                        <td className="p-4 text-sm font-bold">Rs. {e.amt}</td>
                        <td className="p-4 text-right space-x-3">
                          <button onClick={() => setExpenseForm({ title: e.title, amt: e.amt.toString(), idx: i })} className="text-warning">
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => deleteItem('expenses', i)} className="text-danger">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeScreen === 'khata' && (
            <motion.div 
              key="khata"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-card rounded-[22px] p-5 border border-[#30363d]">
                <h3 className="text-xl font-bold mb-4">Khata Management</h3>
                <div className="space-y-3">
                  <input 
                    type="text" 
                    placeholder="Customer Name" 
                    value={khataForm.name}
                    onChange={(e) => setKhataForm(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none"
                  />
                  <input 
                    type="number" 
                    placeholder="Balance Due" 
                    value={khataForm.due}
                    onChange={(e) => setKhataForm(prev => ({ ...prev, due: e.target.value }))}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none"
                  />
                  <input 
                    type="text" 
                    placeholder="Customer Mobile (e.g. 923001234567)" 
                    value={khataForm.phone}
                    onChange={(e) => setKhataForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none"
                  />
                  <textarea 
                    placeholder="Description" 
                    value={khataForm.description}
                    onChange={(e) => setKhataForm(prev => ({ ...prev, description: e.target.value }))}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl w-full outline-none min-h-[100px] resize-none"
                  />
                  <button onClick={saveKhata} className="w-full p-4 rounded-xl bg-warning text-white font-bold">
                    {khataForm.idx !== null ? 'UPDATE KHATA' : 'SAVE KHATA'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {data.khata.map((k, i) => (
                  <div key={i} className={cn(
                    "bg-card p-4 rounded-2xl border transition-all",
                    k.status === 'paid' ? "border-success/30 opacity-70" : "border-[#30363d]"
                  )}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">{k.name}</span>
                          {k.status === 'paid' && <CheckCircle className="w-4 h-4 text-success" />}
                        </div>
                        <div className="text-xs text-[#8b949e]">{k.phone}</div>
                        <div className="text-[10px] text-[#8b949e] italic mt-1">{k.description}</div>
                      </div>
                      <div className="text-right">
                        <div className={cn("font-bold text-lg", k.status === 'paid' ? "text-success" : "text-danger")}>
                          Rs. {k.due}
                        </div>
                        <div className="text-[10px] text-[#8b949e]">{k.date}</div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 justify-end pt-2 border-t border-[#30363d]">
                      {k.status !== 'paid' ? (
                        <>
                          <button 
                            onClick={() => setMessageModal({ khata: k, isPaid: false })} 
                            className="p-3 rounded-xl bg-brand/20 text-brand border border-brand/30 flex-1 flex justify-center"
                            title="Send Message"
                          >
                            <MessageSquare className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => markKhataPaid(i)} 
                            className="p-3 rounded-xl bg-success/20 text-success border border-success/30 flex-1 flex justify-center"
                            title="Mark as Paid"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setKhataForm({ name: k.name, due: k.due.toString(), phone: String(k.phone || ''), description: k.description || '', idx: i })} 
                            className="p-3 rounded-xl bg-warning/20 text-warning border border-warning/30 flex-1 flex justify-center"
                            title="Edit"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-success font-bold text-sm uppercase tracking-widest">
                          PAID
                        </div>
                      )}
                      <button 
                        onClick={() => deleteItem('khata', i)} 
                        className="p-3 rounded-xl bg-danger/20 text-danger border border-danger/30 flex-1 flex justify-center"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
                {data.khata.length === 0 && (
                  <div className="text-center py-10 text-[#8b949e]">No Khata records found.</div>
                )}
              </div>
            </motion.div>
          )}

          {activeScreen === 'reports' && (
            <motion.div 
              key="reports"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-card rounded-[22px] p-5 border border-[#30363d]">
                <h3 className="text-xl font-bold mb-6">Sales Analytics</h3>
                <div className="h-[250px] w-full mb-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.sales.slice(-7)}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                      <XAxis dataKey="date" stroke="#8b949e" fontSize={10} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                      <YAxis stroke="#8b949e" fontSize={10} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px' }}
                        itemStyle={{ color: '#6366f1' }}
                      />
                      <Area type="monotone" dataKey="total" stroke="#6366f1" fillOpacity={1} fill="url(#colorTotal)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  <button onClick={() => {
                    const win = window.open('', '_blank');
                    win?.document.write(`<html><body onload="window.print()"><h2>Stock Report</h2><table border="1" width="100%"><tr><th>Item</th><th>Qty</th></tr>${data.stock.map(p => `<tr><td>${p.name}</td><td>${p.qty}</td></tr>`).join('')}</table></body></html>`);
                    win?.document.close();
                  }} className="p-4 rounded-xl bg-brand text-white font-bold flex items-center justify-center gap-2 text-xs">
                    <Package className="w-4 h-4" /> STOCK REPORT
                  </button>
                  <button onClick={() => {
                    const win = window.open('', '_blank');
                    win?.document.write(`<html><body onload="window.print()"><h2>Expense Report</h2><table border="1" width="100%"><tr><th>Reason</th><th>Amount</th></tr>${data.expenses.map(e => `<tr><td>${e.title}</td><td>${e.amt}</td></tr>`).join('')}</table></body></html>`);
                    win?.document.close();
                  }} className="p-4 rounded-xl bg-danger text-white font-bold flex items-center justify-center gap-2 text-xs">
                    <Wallet className="w-4 h-4" /> EXPENSE REPORT
                  </button>
                </div>

                <hr className="border-[#30363d] mb-8" />

                <h3 className="text-xl font-bold mb-4">Invoice History</h3>
                <div className="flex gap-2 mb-6">
                  <input 
                    type="date" 
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="bg-[#0d1117] border border-[#30363d] text-white p-4 rounded-xl flex-1 outline-none"
                  />
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar">
                  {data.sales
                    .filter(s => s.date === reportDate)
                    .reverse()
                    .map((inv, idx) => (
                      <div key={idx} className="bg-[#1c2128] p-4 rounded-xl border border-[#30363d] flex justify-between items-center">
                        <div>
                          <div className="font-bold text-lg">Rs. {inv.total}</div>
                          <div className="text-xs text-[#8b949e]">{inv.time}</div>
                        </div>
                        <button onClick={() => handlePrint(inv)} className="px-4 py-2 rounded-lg bg-brand/20 text-brand border border-brand/30 text-xs font-bold flex items-center gap-2">
                          <Printer className="w-4 h-4" /> RE-PRINT
                        </button>
                      </div>
                    ))}
                  {data.sales.filter(s => s.date === reportDate).length === 0 && (
                    <p className="text-center text-[#8b949e] py-10">No invoices found for this date.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-4 left-4 right-4 h-[70px] bg-[#161b22]/95 backdrop-blur-xl border border-[#30363d] rounded-[25px] flex justify-around items-center z-[100] shadow-2xl">
        <NavItem active={activeScreen === 'dash'} onClick={() => setActiveScreen('dash')} icon={<Home />} label="Home" />
        <NavItem active={activeScreen === 'pos'} onClick={() => setActiveScreen('pos')} icon={<ShoppingCart />} label="POS" />
        <NavItem active={activeScreen === 'inv'} onClick={() => setActiveScreen('inv')} icon={<Package />} label="Stock" />
        <NavItem active={activeScreen === 'acc'} onClick={() => setActiveScreen('acc')} icon={<Wallet />} label="Exp" />
        <NavItem active={activeScreen === 'khata'} onClick={() => setActiveScreen('khata')} icon={<Users />} label="Khata" />
        <NavItem active={activeScreen === 'reports'} onClick={() => setActiveScreen('reports')} icon={<History />} label="Reports" />
      </nav>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center w-12 transition-all duration-300",
        active ? "text-brand -translate-y-1" : "text-[#8b949e]"
      )}
    >
      <div className={cn("transition-transform", active && "scale-110")}>
        {React.cloneElement(icon as React.ReactElement, { size: 20 })}
      </div>
      <span className="text-[10px] mt-1 font-medium">{label}</span>
    </button>
  );
}
