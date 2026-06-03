import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import FormViewer from "./pages/FormViewer";
import ThankYou from "./pages/ThankYou";
import NotFound from "./pages/NotFound";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/login"     element={<Login />} />
          <Route path="/f/:token"  element={<FormViewer />} />
          <Route path="/thank-you" element={<ThankYou />} />
          <Route path="*"          element={<NotFound />} />
        </Routes>
        <Toaster position="top-center" />
      </BrowserRouter>
    </AuthProvider>
  );
}
