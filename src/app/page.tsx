export default function BackendStatusPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ color: '#D4AF37', margin: '0 0 0.5rem 0', fontSize: '2rem' }}>
        Dandiya Night 3.0 API Server
      </h1>
      <p style={{ color: '#aaa', margin: '0 0 1.5rem 0', fontSize: '0.9rem' }}>
        Enterprise Event Ticketing & Gate Validation Engine
      </p>
      <div style={{ background: '#120719', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '1rem', padding: '1.5rem 2rem', maxWidth: '480px', width: '100%', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#10b981', fontWeight: 'bold', fontSize: '0.9rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
          <span>System Status: Healthy & Online</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#ccc', lineHeight: '1.6' }}>
          <div><strong>Runtime:</strong> Node.js + Next.js Engine</div>
          <div><strong>Database:</strong> PostgreSQL with Prisma ORM</div>
          <div><strong>Payment Gateway:</strong> Razorpay Official (Secured)</div>
          <div><strong>Public Event Endpoint:</strong> <code>/api/public/event</code></div>
          <div><strong>Gatekeeper Scanner:</strong> <code>/api/tickets/validate</code></div>
        </div>
      </div>
    </div>
  );
}
