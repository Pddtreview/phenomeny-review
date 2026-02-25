import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function getAllEntities() {
  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data;
}

export default async function EntitiesPage() {
  const entities = await getAllEntities();

  const grouped: Record<string, typeof entities> = {};
  for (const entity of entities) {
    const type = entity.type || "other";
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(entity);
  }

  const typeOrder = ["company", "model", "country", "lab", "regulator", "person", "institution", "event"];
  const sortedTypes = Object.keys(grouped).sort((a, b) => {
    const ai = typeOrder.indexOf(a);
    const bi = typeOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className={styles.main}>
      <Link href="/" className={styles.back}>← Home</Link>

      <h1 className={styles.heading}>Entities</h1>

      {entities.length === 0 ? (
        <p className={styles.empty}>No entities have been extracted yet.</p>
      ) : (
        sortedTypes.map((type) => (
          <section key={type} className={styles.section}>
            <h2 className={styles.typeHeading}>{type}</h2>
            <ul className={styles.entityList}>
              {grouped[type].map((entity: any) => (
                <li key={entity.id} className={styles.entityItem}>
                  <Link href={`/entities/${entity.slug || entity.name}`} className={styles.entityLink}>
                    {entity.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
