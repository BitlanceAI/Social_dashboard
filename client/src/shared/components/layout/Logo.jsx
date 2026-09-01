import React from 'react';

/**
 * Brand mark.
 *
 * `botlance-logo-trimmed.png` is `botlance-logo.png` with its transparent
 * margins cropped off (the original is a 1024×1024 square whose wordmark
 * occupies ~38% of the height, which would render tiny at a fixed height).
 * The mark is transparent, so it sits directly on either theme background.
 */
const Logo = ({ className = 'h-7' }) => (
    <img
        src="/logo/botlance-logo-trimmed.png"
        alt="Botlance"
        className={`${className} w-auto block`}
    />
);

export default Logo;
