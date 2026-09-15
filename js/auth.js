document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('loginForm')
  const message = document.getElementById('loginMessage')
  const { data: { session } } = await supabaseClient.auth.getSession()
  if (session) window.location.href = 'index.html'

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    message.textContent = 'Signing in...'
    message.className = 'message'

    const email = document.getElementById('email').value.trim()
    const password = document.getElementById('password').value
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password })

    if (error) {
      message.textContent = error.message
      message.className = 'message error'
      return
    }
    window.location.href = 'index.html'
  })
})
