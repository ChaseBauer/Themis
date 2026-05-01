import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuthStore } from '../store'
import type { User } from '../types'

export default function OAuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState('')

  useEffect(() => {
    const providerError = params.get('error')
    const token = params.get('token')
    const userParam = params.get('user')

    if (providerError) {
      setError(providerError)
      return
    }
    if (!token || !userParam) {
      setError('OAuth login did not return a Themis session.')
      return
    }

    try {
      const user = JSON.parse(userParam) as User
      setAuth(token, user)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('OAuth login returned an invalid user profile.')
    }
  }, [navigate, params, setAuth])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Sign-in failed
            </h1>
            <p className="text-sm text-red-600 dark:text-red-400 mb-5">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Back to Sign In
            </button>
          </>
        ) : (
          <div className="flex items-center justify-center text-gray-500 dark:text-gray-300">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Completing sign-in...
          </div>
        )}
      </div>
    </div>
  )
}
