"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import styles from "./header.module.css";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

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
          <Link href="/companies" className={styles.navLink} onClick={() => setMenuOpen(false)}>
            Companies
          </Link>
          <Link href="/models" className={styles.navLink} onClick={() => setMenuOpen(false)}>
            Models
          </Link>
          <Link href="/timeline" className={styles.navLink} onClick={() => setMenuOpen(false)}>
            Timeline
          </Link>
          <Link href="/entities" className={styles.navLink} onClick={() => setMenuOpen(false)}>
            Entities
          </Link>
        </nav>
      </div>
    </header>
  );
}
