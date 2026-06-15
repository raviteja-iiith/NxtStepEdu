import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="landing-page">
      {/* Animated Background */}
      <div className="landing-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="grid-overlay" />
      </div>

      {/* Header */}
      <header className="landing-header">
        <div className="landing-container header-inner">
          <div className="logo-group">
            <div className="logo-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="logo-text">NxtStepEdu</span>
          </div>
          <nav className="header-nav">
            <Link href="#features" className="nav-link">Features</Link>
            <Link href="#stats" className="nav-link">Stats</Link>
            <Link href="/login" className="nav-btn-outline">Login</Link>
            <Link href="/admin/login" className="nav-btn-solid">Admin Portal</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="hero-section">
        <div className="landing-container hero-inner">
          <div className="hero-badge animate-fade-in">
            <span className="badge-dot" />
            Trusted by 100+ Schools across India
          </div>

          <h1 className="hero-title animate-fade-in" style={{ animationDelay: '0.1s' }}>
            The Future of
            <br />
            <span className="gradient-text">School Management</span>
          </h1>

          <p className="hero-subtitle animate-fade-in" style={{ animationDelay: '0.2s' }}>
            Streamline attendance, fees, academics & parent communication
            <br className="hidden-mobile" />
            — all in one powerful, AI-enhanced platform for Indian K-12 schools.
          </p>

          <div className="hero-actions animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <Link href="/login" className="btn-hero-primary">
              Get Started
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/admin/login" className="btn-hero-glass">
              Admin Portal
            </Link>
          </div>

          {/* Hero Visual */}
          <div className="hero-visual animate-fade-in" style={{ animationDelay: '0.5s' }}>
            <div className="dashboard-preview">
              <div className="preview-topbar">
                <div className="preview-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <span className="preview-url">app.nxtstepedu.com/dashboard</span>
              </div>
              <div className="preview-body">
                <div className="preview-sidebar">
                  <div className="ps-item active" />
                  <div className="ps-item" />
                  <div className="ps-item" />
                  <div className="ps-item" />
                  <div className="ps-item" />
                </div>
                <div className="preview-content">
                  <div className="pc-header" />
                  <div className="pc-cards">
                    <div className="pc-card pc-card-blue" />
                    <div className="pc-card pc-card-teal" />
                    <div className="pc-card pc-card-purple" />
                    <div className="pc-card pc-card-green" />
                  </div>
                  <div className="pc-chart" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="stats-section" id="stats">
        <div className="landing-container stats-grid">
          {[
            { value: '100+', label: 'Schools Onboarded', icon: '🏫' },
            { value: '50K+', label: 'Students Managed', icon: '🎓' },
            { value: '99.9%', label: 'Uptime Guarantee', icon: '⚡' },
            { value: '4.9★', label: 'User Rating', icon: '⭐' },
          ].map((stat, i) => (
            <div key={i} className="stat-card animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
              <span className="stat-icon">{stat.icon}</span>
              <p className="stat-value">{stat.value}</p>
              <p className="stat-label">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="features-section" id="features">
        <div className="landing-container">
          <div className="section-header animate-fade-in">
            <span className="section-tag">Features</span>
            <h2 className="section-title">Everything your school needs</h2>
            <p className="section-desc">One platform to replace paper registers, spreadsheets, and WhatsApp groups.</p>
          </div>

          <div className="features-grid">
            {[
              { icon: '📊', title: 'Smart Attendance', desc: 'Real-time tracking with instant parent SMS/WhatsApp alerts. Daily, period-wise or event-based.', color: '#3B82F6' },
              { icon: '💰', title: 'Fee Management', desc: 'Online UPI, card & netbanking payments via Razorpay. Auto-reminders & receipts.', color: '#F59E0B' },
              { icon: '🤖', title: 'AI Insights', desc: 'AI-powered performance analysis, progress reports, and predictive analytics for every student.', color: '#8B5CF6' },
              { icon: '📝', title: 'Exam & Grades', desc: 'Create exams, enter marks, auto-generate report cards with rankings and grade analysis.', color: '#EF4444' },
              { icon: '📅', title: 'Timetable Engine', desc: 'Auto-generate conflict-free timetables. Teacher substitution and period swaps built-in.', color: '#10B981' },
              { icon: '💬', title: 'Parent Connect', desc: 'In-app messaging, announcements, homework alerts and document sharing with parents.', color: '#06B6D4' },
            ].map((feature, i) => (
              <div key={i} className="feature-card animate-fade-in" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="feature-icon" style={{ background: `${feature.color}18`, color: feature.color }}>
                  <span>{feature.icon}</span>
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-desc">{feature.desc}</p>
                <div className="feature-accent" style={{ background: feature.color }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="landing-container cta-inner">
          <div className="cta-glow" />
          <h2 className="cta-title animate-fade-in">Ready to modernize your school?</h2>
          <p className="cta-desc animate-fade-in" style={{ animationDelay: '0.1s' }}>
            Join 100+ schools already using NxtStepEdu to save time and delight parents.
          </p>
          <div className="cta-actions animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <Link href="/login" className="btn-hero-primary">Start Free Trial →</Link>
            <Link href="/admin/login" className="btn-hero-glass">Contact Sales</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container footer-inner">
          <div className="footer-brand">
            <div className="logo-group">
              <div className="logo-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <span className="logo-text">NxtStepEdu</span>
            </div>
            <p className="footer-tagline">Modern School Management for India</p>
          </div>
          <p className="footer-copy">© {new Date().getFullYear()} NxtStepEdu. Built with ❤️ for Indian Schools.</p>
        </div>
      </footer>
    </div>
  );
}
