export default function BrandMark({ size = 'md' }) {
  const box = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  return (
    <div className={`${box} rounded-md bg-[#4F46E5] p-2 shadow-sm`} aria-label="Research Companion">
      <svg viewBox="0 0 32 32" className="h-full w-full" role="img">
        <path d="M9 5h10l4 4v18H9z" fill="white" opacity="0.96" />
        <path d="M19 5v5h5" fill="none" stroke="#C7D2FE" strokeWidth="1.5" />
        <path d="M13 14h8M13 18h6M13 22h8" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="23.5" cy="23.5" r="4.5" fill="#059669" />
        <path d="M21.8 23.5l1.2 1.2 2.3-2.5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
