import React from 'react';
import { Users, Facebook, Instagram } from 'lucide-react';

/**
 * Step 1: Account Selection
 * Pick the Facebook Page, then which Meta surfaces to publish to.
 * Instagram is only offered for Pages that have a linked Instagram
 * Business account (Meta exposes it as page.instagram_business_account).
 */
const StepAccount = ({ pages, selectedPageId, platforms = ['facebook'], onSelect, onPlatformsChange }) => {
    const selectedPage = pages?.find(p => String(p.id) === String(selectedPageId));
    const igAccount = selectedPage?.instagram_business_account;

    const togglePlatform = (platform) => {
        const next = platforms.includes(platform)
            ? platforms.filter(p => p !== platform)
            : [...platforms, platform];
        // Never allow an empty target — fall back to Facebook
        onPlatformsChange(next.length ? next : ['facebook']);
    };

    return (
        <div className="space-y-6 font-mono">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-white uppercase tracking-tight flex items-center gap-3 border-l-4 border-[#26cece] pl-3 mb-6">
                <Users className="h-5 w-5 text-[#26cece]" /> Select Terminal Node
            </h4>
            <div>
                <label className="block text-[10px] font-mono tracking-widest text-[#26cece] uppercase mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#26cece]"></span>
                    Authorized Pages
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    {pages?.map(page => (
                        <div
                            key={page.id}
                            onClick={() => onSelect(page.id)}
                            className={`p-5 border cursor-pointer transition-all flex flex-col gap-2 rounded-none group ${selectedPageId === page.id
                                    ? 'border-[#26cece] bg-[#26cece]/10 shadow-[0_2px_16px_0_rgba(0,0,0,0.4)] -translate-y-1'
                                    : 'border-[#333] bg-[#111111] hover:border-[#26cece] hover:bg-[#070707]'
                                }`}
                        >
                            <h5 className="font-bold font-['Space_Grotesk'] text-white text-lg tracking-tight uppercase group-hover:text-[#26cece] transition-colors">
                                {page.name}
                            </h5>
                            <p className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">{page.category}</p>
                            {page.instagram_business_account?.username && (
                                <p className="text-[10px] font-mono tracking-widest text-[#26cece] uppercase flex items-center gap-1.5">
                                    <Instagram className="h-3 w-3" />
                                    @{page.instagram_business_account.username}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {selectedPage && (
                <div>
                    <label className="block text-[10px] font-mono tracking-widest text-[#26cece] uppercase mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-[#26cece]"></span>
                        Publish To
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        <button
                            type="button"
                            onClick={() => togglePlatform('facebook')}
                            className={`p-5 border transition-all flex items-center gap-3 rounded-none text-left ${platforms.includes('facebook')
                                    ? 'border-[#26cece] bg-[#26cece]/10 text-white'
                                    : 'border-[#333] bg-[#111111] text-gray-500 hover:border-[#26cece]'
                                }`}
                        >
                            <Facebook className="h-5 w-5 shrink-0" />
                            <div>
                                <div className="text-[13px] font-bold uppercase tracking-widest">Facebook Page</div>
                                <div className="text-[10px] tracking-widest uppercase text-gray-500">{selectedPage.name}</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            disabled={!igAccount}
                            onClick={() => igAccount && togglePlatform('instagram')}
                            className={`p-5 border transition-all flex items-center gap-3 rounded-none text-left ${!igAccount
                                    ? 'border-[#222] bg-[#0a0a0a] text-gray-700 cursor-not-allowed'
                                    : platforms.includes('instagram')
                                        ? 'border-[#26cece] bg-[#26cece]/10 text-white'
                                        : 'border-[#333] bg-[#111111] text-gray-500 hover:border-[#26cece]'
                                }`}
                        >
                            <Instagram className="h-5 w-5 shrink-0" />
                            <div>
                                <div className="text-[13px] font-bold uppercase tracking-widest">Instagram</div>
                                <div className="text-[10px] tracking-widest uppercase text-gray-500">
                                    {igAccount ? `@${igAccount.username || igAccount.id}` : 'No linked IG business account'}
                                </div>
                            </div>
                        </button>
                    </div>

                    {platforms.includes('instagram') && (
                        <p className="text-[10px] font-mono tracking-widest text-amber-400/80 uppercase mt-4">
                            Instagram requires at least one image or video — text-only posts are not supported.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default StepAccount;
