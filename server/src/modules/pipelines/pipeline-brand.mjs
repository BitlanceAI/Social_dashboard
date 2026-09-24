const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : null;

export const resolvePipelineBrand = (profile, wordmark) => {
    const name = profile?.client_name?.trim() || '';
    const customWordmark = typeof wordmark === 'string' ? wordmark.trim() : '';
    return {
        name,
        tone: profile?.tone_of_voice?.trim() || '',
        primaryColor: color(profile?.primary_color),
        secondaryColor: color(profile?.secondary_color),
        // Earlier versions stored this default on every pipeline. Treat it as a fallback.
        wordmark: customWordmark && customWordmark !== 'Rahul Saini' ? customWordmark : name || customWordmark || 'Rahul Saini',
    };
};

export const captionBrandContext = brand => [
    brand?.name && `Client brand: ${brand.name}.`,
    brand?.tone && `Follow this client's tone of voice: ${brand.tone}`,
].filter(Boolean).join('\n');

export const imageBrandContext = brand => [
    brand?.name && `Client brand: ${brand.name}.`,
    (brand?.primaryColor || brand?.secondaryColor) && `Workspace brand colors: ${[
        brand.primaryColor && `primary ${brand.primaryColor}`,
        brand.secondaryColor && `secondary ${brand.secondaryColor}`,
    ].filter(Boolean).join(', ')}. If the pipeline image template specifies different colors, follow the template colors.`,
].filter(Boolean).join('\n');
