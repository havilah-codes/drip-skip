"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Bell,
  User,
  MessageCircle as Comment,
} from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Explore",
      href: "/explore",
      icon: Search,
    },
    {
      label: "Messages",
      href: "/messages",
      icon: Comment,
    },
    {
      label: "Feed",
      href: "/feed",
      icon: Home,
      special: true,
    },
    {
      label: "Activity",
      href: "/activity",
      icon: Bell,
    },
    {
      label: "Profile",
      href: "/profile",
      icon: User,
    },
  ];

  return (
    <nav
      className="
        fixed
        bottom-6
        left-1/2
        -translate-x-1/2
        z-50
        w-[calc(100%-2.5rem)]
        max-w-[380px]
        rounded-full
        border
        border-white/15
        bg-black/40
        supports-[backdrop-filter]:bg-zinc-900/40
        backdrop-blur-3xl
        backdrop-saturate-150
        shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.15)]
        transition-all
        duration-300
      "
    >
      <div className="relative h-16 px-3 flex items-center justify-between">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`);

          if (item.special) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className="
                  relative
                  -translate-y-0.5
                  flex
                  items-center
                  justify-center
                  group
                  outline-none
                "
              >
                <div
                  className="
                    w-20
                    h-12
                    rounded-full
                    bg-white
                    text-black
                    flex
                    items-center
                    justify-center
                    transition-all
                    duration-200
                    ease-out
                    group-hover:w-12
                    group-active:scale-95
                  "
                >
                  <Icon size={22} strokeWidth={2.5} />
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`
                relative
                flex
                flex-col
                items-center
                justify-center
                gap-[3px]
                w-12
                h-12
                rounded-full
                transition-all
                duration-200
                ease-out
                outline-none
                active:scale-90
                ${
                  active
                    ? "text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }
              `}
            >
              {active && (
                <span
                  className="
                    absolute
                    inset-0
                    rounded-full
                    bg-white/10
                    border
                    border-white/10
                    shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]
                    animate-in
                    fade-in
                    duration-200
                  "
                />
              )}

              <Icon
                size={20}
                strokeWidth={active ? 2.25 : 1.75}
                className="relative z-10 transition-transform duration-200"
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}