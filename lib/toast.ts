import { toast as sonnerToast } from 'sonner';
import { NotificationType } from '@/contexts/NotificationContext';

const dispatchNotification = (type: NotificationType, message: string, description?: string) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('app-notification', {
                detail: { type, message, description }
            })
        );
    }
};

export const toast = {
    ...sonnerToast,
    success: (message: string, data?: { description?: string }) => {
        dispatchNotification('success', message, data?.description);
        return sonnerToast.success(message, data);
    },
    error: (message: string, data?: { description?: string }) => {
        dispatchNotification('error', message, data?.description);
        return sonnerToast.error(message, data);
    },
    info: (message: string, data?: { description?: string }) => {
        dispatchNotification('info', message, data?.description);
        return sonnerToast.info(message, data);
    },
    warning: (message: string, data?: { description?: string }) => {
        dispatchNotification('warning', message, data?.description);
        return sonnerToast.warning(message, data);
    }
};
