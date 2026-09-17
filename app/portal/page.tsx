import Image from 'next/image'

export const metadata = { title: 'Portal de cliente · KickPlanner' }

export default function PortalRaiz() {
  return (
    <div className="pt-gate">
      <div className="pt-gate-in">
        {/* Mismo criterio que la puerta de contraseña: el logo va sobre el
            fondo oscuro, no sobre la tarjeta blanca. */}
        <Image
          className="pt-gate-logo"
          src="/kickranking-blanco-verde.png"
          alt="KickRanking"
          width={2560}
          height={274}
          priority
        />
        <div className="pt-gate-box">
          <h1>Necesitás tu enlace</h1>
          <p className="lead">
            Cada cliente entra por una dirección propia. Buscá el enlace que te envió el
            equipo de KickRanking, o escribinos y te lo reenviamos.
          </p>
        </div>
      </div>
    </div>
  )
}
