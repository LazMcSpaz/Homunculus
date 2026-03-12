'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './NavBar.module.css';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: '\u2302' },      // ⌂
  { href: '/tasks', label: 'Tasks', icon: '\u2637' }, // ☷
  { spacer: true },
  { href: '/reviews', label: 'Reviews', icon: '\u2606' }, // ☆
  { href: '/more', label: 'More', icon: '\u2026' },       // …
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className={styles.navbar}>
      {NAV_ITEMS.map((item, i) => {
        if ('spacer' in item && item.spacer) {
          return <div key={i} className={styles.navSpacer} />;
        }
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href!}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
