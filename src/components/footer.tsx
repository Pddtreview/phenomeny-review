import Link from "next/link";
import Image from "next/image";
import styles from "./footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.brand}>
          <Image
            src="/images/logo-brand.png"
            alt="Phenomeny Review™"
            width={180}
            height={36}
            className={styles.brandLogo}
          />
          <span className={styles.brandTagline}>AI Evolution Repository</span>
          <span className={styles.brandMuted}>Structured record of AI development.</span>
        </div>
        <div className={styles.links}>
          <Link href="/companies" className={styles.footerLink}>Companies</Link>
          <Link href="/models" className={styles.footerLink}>Models</Link>
          <Link href="/timeline" className={styles.footerLink}>Timeline</Link>
          <a href="/sitemap.xml" className={styles.footerLink}>Sitemap</a>
        </div>
      </div>
      <div className={styles.copyright}>
        © 2026 Phenomeny LLP™. All rights reserved.
      </div>
    </footer>
  );
}
