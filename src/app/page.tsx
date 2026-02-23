import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Phenomeny Review™</h1>
      <p className={styles.description}>AI-powered editorial platform</p>
    </main>
  );
}
