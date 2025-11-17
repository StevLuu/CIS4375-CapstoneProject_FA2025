// frontend/src/Components/ui/Modal.tsx
import { useEffect, useCallback } from "react";

type ModalProps = {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
};

export default function Modal({ open, onClose, title, children }: ModalProps) {
    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if (!open) return;
            if (e.key === "Escape") onClose();
        },
        [open, onClose]
    );

    // Close on Escape
    useEffect(() => {
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [handleKey]);

    // Lock background scroll when modal is open
    useEffect(() => {
        if (!open) return;

        const body = document.body;
        const html = document.documentElement;

        const prevBodyOverflow = body.style.overflow;
        const prevHtmlOverflow = html.style.overflow;

        body.style.overflow = "hidden";
        html.style.overflow = "hidden";

        return () => {
            body.style.overflow = prevBodyOverflow;
            html.style.overflow = prevHtmlOverflow;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50"
                onClick={onClose}
                data-testid="modal-overlay"
            />

            {/* Centered, scrollable content */}
            <div className="relative z-10 w-full max-w-md">
                <div className="max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900 dark:border dark:border-neutral-800">
                    {title ? (
                        <h2 className="mb-4 text-xl font-semibold text-neutral-900 dark:text-white">
                            {title}
                        </h2>
                    ) : null}
                    {children}
                </div>
            </div>
        </div>
    );
}
