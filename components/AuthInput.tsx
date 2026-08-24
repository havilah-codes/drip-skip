'use client';

import { useState, ChangeEvent } from 'react';

interface AuthInputProps {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  required?: boolean;
  error?: string;
}

export default function AuthInput({
  id,
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  autoComplete,
  required = true,
  error
}: AuthInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordType = type === 'password';

  return (
    <div className="w-full flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-zinc-300 tracking-wide uppercase">
        {label}
      </label>
      
      <div className="relative w-full">
        <input
          id={id}
          type={isPasswordType && showPassword ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full h-12 px-4 rounded-xl bg-bg-sunken/80 border text-text-p text-sm placeholder-zinc-500 transition-all duration-200 focus:outline-none focus:ring-2 ${
            error
              ? 'border-red-500/80 focus:ring-red-500/50'
              : 'border-border-d focus:border-zinc-400 focus:ring-white/10'
          }`}
        />

        {isPasswordType && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-s hover:text-text-p transition-colors focus:outline-none focus:ring-1 focus:ring-white rounded p-1"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12c1.274 4.057 5.065 7 9.542 7 4.477 0 8.268-2.943 9.542-7-1.274-4.057-5.065-7-9.542-7-4.477 0-8.268 2.943-9.542 7Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-400 mt-0.5 animate-fadeIn">
          {error}
        </p>
      )}
    </div>
  );
}