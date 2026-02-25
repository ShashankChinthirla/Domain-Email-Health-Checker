'use server';

import clientPromise from '@/lib/mongodb';

// Define the root admin that should always have access, regardless of database state
const ROOT_ADMIN = 'shashankshashankc39@gmail.com';

export interface AdminUser {
    email: string;
    addedBy: string;
    createdAt: Date;
}

/**
 * Checks if an email has admin privileges.
 * Automatically seeds the ROOT_ADMIN if the collection is empty.
 */
export async function isAdmin(email: string | null | undefined): Promise<boolean> {
    if (!email) return false;

    // Fast-path for root developer
    if (email === ROOT_ADMIN) return true;

    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection<AdminUser>('admin_users');

        // Check if database is empty - if so, seed ROOT_ADMIN and maybe paybalc06@gmail.com
        const count = await collection.countDocuments();
        if (count === 0) {
            await collection.insertMany([
                { email: ROOT_ADMIN, addedBy: 'system', createdAt: new Date() },
                { email: 'paybalc06@gmail.com', addedBy: 'system', createdAt: new Date() }
            ]);
        }

        const adminDoc = await collection.findOne({ email });
        return !!adminDoc;
    } catch (error) {
        console.error("Error checking admin role:", error);
        // Fail closed for security, but allow root admin to always login even if Mongo is down
        return false;
    }
}

export async function getAdmins(): Promise<AdminUser[]> {
    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection<AdminUser>('admin_users');

        // Ensure root admins exist
        const count = await collection.countDocuments();
        if (count === 0) {
            await collection.insertMany([
                { email: ROOT_ADMIN, addedBy: 'system', createdAt: new Date() },
                { email: 'paybalc06@gmail.com', addedBy: 'system', createdAt: new Date() }
            ]);
        }

        const result = await collection.find().sort({ createdAt: -1 }).toArray();
        return result.map(doc => ({
            email: doc.email,
            addedBy: doc.addedBy,
            createdAt: doc.createdAt
        })) as AdminUser[];
    } catch (error) {
        console.error("Error listing admins:", error);
        return [];
    }
}

export async function addAdmin(email: string, addedBy: string): Promise<{ success: boolean; message: string }> {
    if (!email) return { success: false, message: 'Email required' };

    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection<AdminUser>('admin_users');

        // Check if already exists
        const exists = await collection.findOne({ email });
        if (exists) {
            return { success: false, message: 'User is already an admin' };
        }

        await collection.insertOne({
            email,
            addedBy,
            createdAt: new Date()
        });

        return { success: true, message: 'Admin added successfully' };
    } catch (error) {
        console.error("Error adding admin:", error);
        return { success: false, message: 'Database error' };
    }
}

export async function removeAdmin(emailToRemove: string, requestingUserEmail: string): Promise<{ success: boolean; message: string }> {
    // Prevent removing the root developer
    if (emailToRemove === ROOT_ADMIN) {
        return { success: false, message: 'Cannot remove the root administrator' };
    }

    // Prevent removing yourself (avoids accidental lockouts)
    if (emailToRemove === requestingUserEmail) {
        return { success: false, message: 'You cannot remove your own admin access' };
    }

    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection<AdminUser>('admin_users');

        const result = await collection.deleteOne({ email: emailToRemove });

        if (result.deletedCount === 1) {
            return { success: true, message: 'Admin removed successfully' };
        } else {
            return { success: false, message: 'Admin not found' };
        }
    } catch (error) {
        console.error("Error removing admin:", error);
        return { success: false, message: 'Database error' };
    }
}
