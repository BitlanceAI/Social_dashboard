import React from 'react';

/**
 * Brand mark.
 *
 * The source file is a JPEG, so it has no transparency — it carries its own
 * white background. On the dark theme that would otherwise read as a white
 * rectangle, so the mark sits in a deliberate white chip with a little padding.
 * On the light theme the chip is invisible against the page.
 *
 * Swap in a transparent PNG or SVG and the chip can go away.
 */
const Logo = ({ className = 'h-7' }) => (
    <span className="inline-flex items-center rounded-md bg-white px-2 py-1">
        <img
            src="/logo/botlance-logo.jpg"
            alt="Botlance"
            className={`${className} w-auto block`}
        />
    </span>
);

export default Logo;
