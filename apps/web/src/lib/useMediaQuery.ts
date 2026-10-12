import { useEffect, useState } from 'react';

/** بيرجع true لو الشاشة مطابقة للـ media query، وبيتحدث مع تغيير حجم الشاشة. */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

/** نفس نقطة md في Tailwind (768px). */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
