const COUNT = Number(process.env.ZZ_DROP_COUNT || 10);
export default async function extract() {
  return Array.from({ length: COUNT }, (_, i) => ({
    id: `org-${String(i).padStart(2, '0')}`,
    name: `Veterans Organization Number ${i}`,
    orgType: 'nonprofit', jurisdiction: 'TX', confidence: 'scraped',
  }));
}
