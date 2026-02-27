"use client"

import { Brain3D } from "@/components/Brain3D"

export default function Home() {
    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <Brain3D width={960} height={700} />
        </main>
    )
}
