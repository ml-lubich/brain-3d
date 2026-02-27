import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
    title: "brain-3d",
    description: "Interactive 3D brain wireframe",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="antialiased">{children}</body>
        </html>
    )
}
