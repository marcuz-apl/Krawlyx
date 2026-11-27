import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Home, Send, MapPin, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { api } from "@/lib/api/client";

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const EMPTY_FORM: FormData = { name: "", email: "", subject: "", message: "" };

const inputClasses =
  "w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all";

const labelClasses =
  "block text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-1";

export function ContactPage() {
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [status, setStatus] = useState<{ loading: boolean; success: boolean; error: string | null }>(
    { loading: false, success: false, error: null },
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ loading: true, success: false, error: null });

    try {
      await api.messages.submit(formData);
      setStatus({ loading: false, success: true, error: null });
      setFormData(EMPTY_FORM);
    } catch (err) {
      setStatus({
        loading: false,
        success: false,
        error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6 max-w-7xl mx-auto">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-400 dark:hover:text-brand-300 transition"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
          <span className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-brand-600 to-indigo-500 bg-clip-text text-transparent dark:from-brand-400 dark:to-indigo-300">
            Contact Alfazen
          </span>
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Krawlyx Support
          </span>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Header Title Section */}
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-brand-600 to-indigo-500 bg-clip-text text-transparent dark:from-brand-400 dark:to-indigo-300">
            Get in Touch
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Have questions about Krawlyx, licensing, custom extraction adapters, or
            operational integrations? Send us a message and our team will get back to you shortly.
          </p>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Left Column: Contact Form */}
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-md flex flex-col justify-between backdrop-blur-md relative overflow-hidden group">
            {/* Ambient top accent */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-indigo-500 opacity-50" />

            <div className="space-y-6">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-2">
                <Mail className="h-4.5 w-4.5 text-brand-500" />
                Send a Message
              </h2>

              {status.success && (
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950/40 dark:bg-emerald-950/20 dark:text-emerald-400 text-xs flex items-start gap-2.5">
                  <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Message sent!</span> Thank you for reaching out. We
                    will contact you soon.
                  </div>
                </div>
              )}

              {status.error && (
                <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:border-red-950/50 dark:bg-red-950/20 dark:text-red-400 text-xs flex items-start gap-2.5">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Submission failed.</span> {status.error}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className={labelClasses}>
                      Full Name
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="John Doe"
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className={labelClasses}>
                      Email Address
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="john@example.com"
                      className={inputClasses}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-subject" className={labelClasses}>
                    Subject
                  </label>
                  <input
                    id="contact-subject"
                    type="text"
                    name="subject"
                    required
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="e.g. Enterprise Licensing"
                    className={inputClasses}
                  />
                </div>

                <div>
                  <label htmlFor="contact-message" className={labelClasses}>
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us about your requirements..."
                    className={`${inputClasses} resize-none`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={status.loading}
                  className="w-full bg-brand-600 hover:bg-brand-500 active:scale-[0.99] disabled:bg-brand-800 text-white font-semibold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {status.loading ? (
                    <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" /> Send Message
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Corporate Info Footer */}
            <div className="border-t border-slate-100 dark:border-slate-800/85 mt-6 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-indigo-500 shrink-0" />
                <span>Calgary, AB, Canada</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-500 shrink-0" />
                <span>info@alfazen.org</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-md backdrop-blur-md relative overflow-hidden group h-[400px] lg:h-full">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-brand-500 opacity-50 z-10" />
            <iframe
              title="Google Maps Calgary"
              src="https://maps.google.com/maps?q=Calgary,%20AB,%20Canada&t=&z=10&ie=UTF8&iwloc=&output=embed"
              className="w-full h-full border-0 rounded-xl block"
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
