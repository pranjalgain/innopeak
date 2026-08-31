// Simple user service for demonstration
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// Mock database - in real app, this would use Drizzle ORM
let users: User[] = [];

export class UserService {
  static async createUser(userData: Omit<User, "id" | "createdAt">): Promise<User> {
    const user: User = {
      id: Math.random().toString(36).substring(7),
      ...userData,
      createdAt: new Date(),
    };

    users.push(user);
    return user;
  }

  static async getUserById(id: string): Promise<User | null> {
    return users.find((user) => user.id === id) || null;
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    return users.find((user) => user.email === email) || null;
  }

  static async getAllUsers(): Promise<User[]> {
    return [...users];
  }

  static async updateUser(
    id: string,
    updates: Partial<Omit<User, "id" | "createdAt">>,
  ): Promise<User | null> {
    const userIndex = users.findIndex((user) => user.id === id);
    if (userIndex === -1) return null;

    users[userIndex] = { ...users[userIndex], ...updates };
    return users[userIndex];
  }

  static async deleteUser(id: string): Promise<boolean> {
    const userIndex = users.findIndex((user) => user.id === id);
    if (userIndex === -1) return false;

    users.splice(userIndex, 1);
    return true;
  }

  // Test helper to reset data
  static reset(): void {
    users = [];
  }
}
