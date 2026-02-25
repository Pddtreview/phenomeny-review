import Link from "next/link";
import styles from "./footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.brand}>
          <span className={styles.brandName}>Phenomeny Review™</span>
          <span className={styles.brandTagline}>AI Evolution Repository</span>
        </div>
        <div className={styles.links}>
          <Link href="/companies" className={styles.footerLink}>Companies</Link>
          <Link href="/models" className={styles.footerLink}>Models</Link>
          <Link href="/timeline" className={styles.footerLink}>Timeline</Link>
          <a href="/sitemap.xml" className={styles.footerLink}>Sitemap</a>
        </div>
      </div>
      <div className={styles.copyright}>
        © 2026 Phenomeny Review™
      </div>
    </footer>
  );
}
