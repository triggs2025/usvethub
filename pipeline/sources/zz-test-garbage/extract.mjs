export default async function extract() {
  return [
    { id: 'ok-org', name: 'A Real Veterans Organization', orgType: 'nonprofit', jurisdiction: 'TX', confidence: 'scraped' },
    { id: 'bad-url', name: 'Evil Org', orgType: 'nonprofit', jurisdiction: 'TX', confidence: 'scraped', website: 'javascript:alert(document.cookie)' },
    { id: 'bad-type', name: 'Wrong Type Org', orgType: 'not-a-real-type', jurisdiction: 'TX', confidence: 'scraped' },
    { name: 'No Id At All', orgType: 'nonprofit', jurisdiction: 'TX', confidence: 'scraped' },
  ];
}
