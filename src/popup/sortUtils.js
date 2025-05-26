export function compareDates(a, b, ascending) {
  if (!a.lastEmailDate && !b.lastEmailDate) return 0;
  if (!a.lastEmailDate) return 1;
  if (!b.lastEmailDate) return -1;
  const cmp = a.lastEmailDate.localeCompare(b.lastEmailDate);
  return ascending ? cmp : -cmp;
}

export function sortAccounts(accounts, sortOrder) {
  if (sortOrder === 'default') return accounts;
  const sorted = [...accounts];
  switch (sortOrder) {
    case 'recent':
      sorted.sort((a, b) => compareDates(a, b, false));
      break;
    case 'oldest':
      sorted.sort((a, b) => compareDates(a, b, true));
      break;
    case 'name-asc':
      sorted.sort((a, b) => {
        const nameA = (a.justDeleteMeData && typeof a.justDeleteMeData === 'object' ? a.justDeleteMeData.name : a.name) || '';
        const nameB = (b.justDeleteMeData && typeof b.justDeleteMeData === 'object' ? b.justDeleteMeData.name : b.name) || '';
        return nameA.localeCompare(nameB);
      });
      break;
  }
  return sorted;
}

export function formatEmailDate(isoString) {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
