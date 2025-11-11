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


    useEffect(() => {
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [handleKey]);


    useEffect(() => {
        if (open) {
            const original = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            return () => {
                document.body.style.overflow = original;
            };
        }
    }, [open]);


    if (!open) return null;


    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-0 z-50"
        >
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
                data-testid="modal-overlay"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900 dark:border dark:border-neutral-800">
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