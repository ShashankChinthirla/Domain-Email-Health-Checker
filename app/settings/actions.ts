'use server';

import clientPromise from '@/lib/mongodb';

import { UserSettings, DEFAULT_SETTINGS } from './types';

export async function getUserSettings(email: string) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection('user_settings');

        const settings = await collection.findOne({ email });

        if (!settings) {
            return { success: true, settings: DEFAULT_SETTINGS };
        }

        return {
            success: true,
            settings: {
                displayName: settings.displayName || '',
                emailClient: settings.emailClient || DEFAULT_SETTINGS.emailClient,
                messageTemplate: settings.messageTemplate || DEFAULT_SETTINGS.messageTemplate,
                senderName: settings.senderName || '',
                senderTitle: settings.senderTitle || '',
                senderPhone: settings.senderPhone || ''
            }
        };
    } catch (error) {
        console.error("Error fetching user settings:", error);
        return { success: false, error: "Failed to fetch settings" };
    }
}

export async function saveUserSettings(email: string, settings: UserSettings) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection('user_settings');

        await collection.updateOne(
            { email },
            { $set: { ...settings, updatedAt: new Date() } },
            { upsert: true }
        );

        return { success: true };
    } catch (error) {
        console.error("Error saving user settings:", error);
        return { success: false, error: "Failed to save settings" };
    }
}
