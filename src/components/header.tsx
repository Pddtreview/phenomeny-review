"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import styles from "./header.module.css";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isArchive = pathname.startsWith("/archive");
  const isNews = !isArchive;

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.logo}>
          <Image
            src="/images/logo-brand.png"
            alt="Phenomeny Review™"
            width={200}
            height={40}
            className={styles.logoImage}
            priority
          />
        </Link>
        <button
          className={styles.menuButton}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle navigation"
          data-testid="button-menu-toggle"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menuOpen ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}>
          <Link href="/companies" className={styles.navLink} onClick={() => setMenuOpen(false)} data-testid="link-companies">
            Companies
          </Link>
          <Link href="/models" className={styles.navLink} onClick={() => setMenuOpen(false)} data-testid="link-models">
            Models
          </Link>
          <Link href="/timeline" className={styles.navLink} onClick={() => setMenuOpen(false)} data-testid="link-timeline">
            Timeline
          </Link>
          <Link href="/#research" className={styles.navLink} onClick={() => setMenuOpen(false)} data-testid="link-research">
            Research
          </Link>
          <a href="#" className={styles.navLink} onClick={(e) => { e.preventDefault(); setMenuOpen(false); }} data-testid="link-search">
            Search
          </a>
          <a href="#subscribe" className={styles.navLink} onClick={() => setMenuOpen(false)} data-testid="link-subscribe">
            Subscribe
          </a>
          <div className={styles.modeToggle}>
            <Link
              href="/"
              className={`${styles.modeButton} ${isNews ? styles.modeActive : ""}`}
              data-testid="button-news-mode"
            >
              News Mode
            </Link>
            <Link
              href="/archive"
              className={`${styles.modeButton} ${isArchive ? styles.modeActive : ""}`}
              data-testid="button-archive-mode"
            >
              Archive Mode
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
