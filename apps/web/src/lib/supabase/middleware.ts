import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // If Supabase is not configured, allow all routes (development mode)
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Wrap getUser in try/catch: token refresh can throw "fetch failed" when
  // the refresh token is expired or Supabase is temporarily unreachable.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Silently treat as unauthenticated — the user will be redirected to /login
    // if they try to access a protected route.
  }

  const pathname = request.nextUrl.pathname;

  // ── Let Server Actions pass through unconditionally ──────────────────────
  // Next.js Server Actions are POST requests with a `Next-Action` header.
  // They return JSON — not HTML — so middleware redirects break them with
  // "An unexpected response was received from the server".
  const isServerAction =
    request.method === 'POST' &&
    (request.headers.get('next-action') !== null ||
      request.headers.get('content-type')?.includes('multipart/form-data'));
  if (isServerAction) {
    return supabaseResponse;
  }

  // Public routes that don't require auth
  const publicRoutes = ['/login', '/admin/login', '/', '/change-password'];
  const isPublicRoute = publicRoutes.some(route => pathname === route || (route !== '/' && pathname.startsWith(route)));

  // Static assets and API routes
  if (pathname.startsWith('/api/')) {
    return supabaseResponse;
  }

  // If user is not authenticated and trying to access protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user is authenticated, check role-based access
  if (user && !isPublicRoute) {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('role, school_id, is_active, is_first_login')
        .eq('id', user.id)
        .single();

      if (userData) {
        // Check if user is active
        if (!userData.is_active) {
          await supabase.auth.signOut();
          const url = request.nextUrl.clone();
          url.pathname = '/login';
          url.searchParams.set('error', 'account_deactivated');
          return NextResponse.redirect(url);
        }

        // Check if school is active (for non-admin users)
        if (userData.role !== 'admin' && userData.school_id) {
          const { data: school } = await supabase
            .from('schools')
            .select('is_active')
            .eq('id', userData.school_id)
            .single();

          if (school && !school.is_active) {
            await supabase.auth.signOut();
            const url = request.nextUrl.clone();
            url.pathname = '/login';
            url.searchParams.set('error', 'school_paused');
            return NextResponse.redirect(url);
          }
        }

        // Force password change on first login
        if (userData.is_first_login && !pathname.startsWith('/change-password')) {
          const url = request.nextUrl.clone();
          url.pathname = '/change-password';
          return NextResponse.redirect(url);
        }

        // Role-based route protection
        const roleRoutes: Record<string, string> = {
          admin: '/admin',
          principal: '/principal',
          teacher: '/teacher',
          parent: '/parent',
        };

        const allowedPrefix = roleRoutes[userData.role];
        if (allowedPrefix && !pathname.startsWith(allowedPrefix) && !pathname.startsWith('/change-password')) {
          const url = request.nextUrl.clone();
          url.pathname = `${allowedPrefix}/dashboard`;
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // If users table doesn't exist yet, allow through
    }
  }

  // If authenticated user tries to access login pages, redirect to dashboard
  if (user && (pathname === '/login' || pathname === '/admin/login')) {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userData) {
        const url = request.nextUrl.clone();
        url.pathname = `/${userData.role}/dashboard`;
        return NextResponse.redirect(url);
      }
    } catch {
      // Allow through if table doesn't exist
    }
  }

  return supabaseResponse;
}
