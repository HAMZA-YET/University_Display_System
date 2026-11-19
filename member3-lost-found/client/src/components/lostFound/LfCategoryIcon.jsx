/** Simple line icons per category (decorative; the category name is always shown as text too). */
const PATHS = {
  ELECTRONICS: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  WALLET_ID_CARD: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 14h2" />
    </>
  ),
  KEYS: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M16 7l2 2M14 9l2 2" />
    </>
  ),
  BAG: (
    <>
      <path d="M5 8h14l-1 13H6L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  CLOTHING: <path d="M8 3l4 3 4-3 5 4-3 4-2-1v11H8V10l-2 1-3-4 5-4z" />,
  BOOKS_STATIONERY: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </>
  ),
  JEWELLERY_ACCESSORY: (
    <>
      <circle cx="12" cy="14" r="6" />
      <path d="M9 4h6l-3 4-3-4z" />
    </>
  ),
  WATER_BOTTLE: (
    <>
      <path d="M10 2h4v3h-4zM9 5h6l1 3v13H8V8l1-3z" />
      <path d="M8 12h8" />
    </>
  ),
  UMBRELLA: (
    <>
      <path d="M3 12a9 9 0 0 1 18 0H3z" />
      <path d="M12 12v7a2 2 0 0 1-4 0" />
    </>
  ),
  OTHER: (
    <>
      <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
};

export default function LfCategoryIcon({ category, size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[category] || PATHS.OTHER}
    </svg>
  );
}
