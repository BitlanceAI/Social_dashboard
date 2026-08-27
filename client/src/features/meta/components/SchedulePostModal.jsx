import React from 'react';
import { X, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Post composer modal - wraps the multi-step wizard
 * 
 * Props:
 * - onValidate: (step) => boolean | string - optional validation function
 *   Returns true to proceed, or a string error message to show
 */
const SchedulePostModal = ({
    isOpen,
    onClose,
    currentStep,
    setCurrentStep,
    children,
    onSubmit,
    onValidate,
    isSubmitting = false,
    // 'schedule' queues the post for later; 'now' publishes immediately and
    // therefore has no Schedule step.
    mode = 'schedule'
}) => {
    if (!isOpen) return null;

    const publishNow = mode === 'now';

    const steps = [
        { num: 1, label: 'Account' },
        { num: 2, label: 'Content' },
        ...(publishNow ? [] : [{ num: 3, label: 'Schedule' }]),
        { num: 5, label: 'Review' }
    ];

    const order = steps.map(s => s.num);
    const pos = order.indexOf(currentStep);
    const isLast = pos === order.length - 1;
    const goNext = () => setCurrentStep(order[Math.min(pos + 1, order.length - 1)]);
    const goBack = () => setCurrentStep(order[Math.max(pos - 1, 0)]);
    const isFirst = pos <= 0;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header with Progress */}
                <div className="p-6 border-b border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-2xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight pl-3 border-l-4 border-[var(--accent)]">
                            {publishNow ? 'Publish Now' : 'Schedule a Post'}
                        </h3>
                        <button
                            onClick={() => !isSubmitting && onClose()}
                            className="p-2 border border-transparent hover:border-[var(--border)] hover:text-red-500 hover:bg-red-500/10 text-[var(--muted)] transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Step Progress Bar */}
                    <div className="flex items-center justify-between px-2">
                        {steps.map((step, idx) => (
                            <React.Fragment key={step.num}>
                                <div className="flex flex-col items-center">
                                    <div
                                        className={`w-8 h-8 border flex items-center justify-center text-xs font-bold transition-all ${currentStep > step.num
                                            ? 'bg-[var(--border)] border-[var(--accent)] text-[var(--text)]'
                                            : currentStep === step.num
                                                ? 'bg-[var(--accent)] text-[var(--bg)] border-[var(--bg)] shadow-[2px_2px_0_0_var(--border)]'
                                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted-2)]'
                                            }`}
                                    >
                                        {currentStep > step.num ? (
                                            <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
                                        ) : (
                                            step.num
                                        )}
                                    </div>
                                    <span
                                        className={`text-xs mt-3 font-bold ${currentStep >= step.num
                                            ? 'text-[var(--accent)]'
                                            : 'text-[var(--muted-2)]'
                                            }`}
                                    >
                                        {step.label}
                                    </span>
                                </div>
                                {idx < steps.length - 1 && (
                                    <div
                                        className={`flex-1 h-px mx-4 transition-all ${currentStep > step.num
                                            ? 'bg-[var(--accent)]'
                                            : 'bg-[var(--border)]'
                                            }`}
                                    />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="relative flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg)]">
                    <div className="p-6">{children}</div>

                    {/* While a publish is in flight the form is inert, so a
                        second click cannot create a duplicate post. */}
                    {isSubmitting && (
                        <div className="absolute inset-0 z-10 bg-[var(--bg)]/85 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
                            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)] mb-4" />
                            <p className="text-base font-semibold text-[var(--text)] mb-1">
                                {publishNow ? 'Publishing your post…' : 'Scheduling your post…'}
                            </p>
                            <p className="text-sm text-[var(--muted)] max-w-xs">
                                {publishNow
                                    ? 'Sending to Meta. Video can take a little longer — please do not close this or press publish again.'
                                    : 'Saving to your queue. This only takes a moment.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Navigation */}
                <div className="p-6 border-t border-[var(--border)] bg-[var(--bg)] flex justify-between">
                    <button
                        onClick={() => {
                            if (isSubmitting) return;
                            if (!isFirst) goBack();
                            else onClose();
                        }}
                        disabled={isSubmitting}
                        className="px-6 py-3 border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-all text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {isFirst ? 'Cancel' : 'Back'}
                    </button>

                    {!isLast ? (
                        <button
                            onClick={() => {
                                if (onValidate) {
                                    const result = onValidate(currentStep);
                                    if (result !== true) {
                                        toast.error(result || 'Please complete this step');
                                        return;
                                    }
                                }
                                goNext();
                            }}
                            className="px-6 py-3 bg-[var(--accent)] border border-[var(--bg)] text-[var(--bg)] font-bold font-['Space_Grotesk'] text-[12px] hover:shadow-[4px_4px_0_0_var(--border)] transition-all hover:-translate-y-1 flex items-center gap-2"
                        >
                            Next <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            onClick={onSubmit}
                            disabled={isSubmitting}
                            className="px-8 py-3 bg-[var(--accent)] disabled:cursor-not-allowed border border-[var(--bg)] font-bold font-['Space_Grotesk'] text-[var(--bg)] hover:shadow-[4px_4px_0_0_var(--border)] transition-all hover:-translate-y-1 disabled:opacity-50 disabled:hover:-translate-y-0 disabled:hover:shadow-none"
                        >
                            <span className="flex items-center gap-2">
                                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                {isSubmitting
                                    ? (publishNow ? 'Publishing…' : 'Scheduling…')
                                    : (publishNow ? 'Publish Now' : 'Schedule Post')}
                            </span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SchedulePostModal;
