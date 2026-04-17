import NextAuth from 'next-auth';
import { loadAuthConfig } from './config';
import { buildProviders } from './providers';
import type { UserRole } from './types';

const cfg = loadAuthConfig();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: cfg.secret,
  session: { strategy: 'jwt' },
  providers: buildProviders() as never,
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user && 'role' in user && user.role) {
        token.role = user.role as UserRole;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: UserRole }).role = token.role;
        session.user.id = typeof token.sub === 'string' ? token.sub : session.user.id;
      }
      return session;
    },
  },
});
