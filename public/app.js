// Enhanced client logic with carousel, status indicators, and synced lists

const serverBadge = document.getElementById('server-number')
const imageCaption = document.getElementById('image-caption')
const mainImage = document.getElementById('main-image')
const placeholder = document.getElementById('placeholder')
const openFormBtn = document.getElementById('open-form')
const formDialog = document.getElementById('form-dialog')
const closeFormBtn = document.getElementById('close-form')
const uploadForm = document.getElementById('upload-form')
const nameInput = document.getElementById('name-input')
const fileInput = document.getElementById('file-input')
const formError = document.getElementById('form-error')

const carouselTrack = document.getElementById('carousel-track')
const carouselDots = document.getElementById('carousel-dots')
const prevBtn = document.getElementById('carousel-prev')
const nextBtn = document.getElementById('carousel-next')

const tableBody = document.querySelector('#images-table tbody')
const prevPageBtn = document.getElementById('prev-page')
const nextPageBtn = document.getElementById('next-page')
const pageInfo = document.getElementById('page-info')

const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 90'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230883b6'/%3E%3Cstop offset='100%25' stop-color='%23043f6e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='120' height='90' rx='14' fill='url(%23grad)'/%3E%3Cpath d='M24 64l18-22 14 16 10-12 12 20H24z' fill='%23fff' opacity='.65'/%3E%3C/svg%3E"

let page = 1
const limit = 10
let total = 0
let carouselItems = []
let carouselIndex = 0
let slideWidth = 320
let carouselTimer = null

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(String(url || ''))
}

async function fetchJSON(path) {
  const res = await fetch(path, { headers: { 'Cache-Control': 'no-cache' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return { data, headers: res.headers }
}

function setServerBadgeInfo(info = {}) {
  if (!serverBadge) return
  const { serverNumber } = info
  serverBadge.textContent = serverNumber ? `Serveur #${serverNumber}` : ''
}

function renderMainImage(item) {
  if (!item) {
    mainImage.style.display = 'none'
    placeholder.style.display = 'grid'
    if (imageCaption) imageCaption.textContent = ''
    return
  }
  const src = isImageUrl(item.imageUrl) ? item.imageUrl : PLACEHOLDER_IMG
  mainImage.src = src
  mainImage.alt = item.name
  mainImage.style.display = 'block'
  placeholder.style.display = 'none'
  if (imageCaption) imageCaption.textContent = item.name
  mainImage.onerror = () => {
    mainImage.src = PLACEHOLDER_IMG
  }
}

function resetCarouselTimer() {
  if (carouselTimer) clearInterval(carouselTimer)
  if (!carouselItems.length) return
  carouselTimer = setInterval(() => {
    setActiveSlide(carouselIndex + 1)
  }, 5000)
}

function setActiveSlide(index) {
  if (!carouselItems.length) return
  carouselIndex = (index + carouselItems.length) % carouselItems.length
  const cards = Array.from(carouselTrack.querySelectorAll('.carousel-card'))
  const dots = Array.from(carouselDots.querySelectorAll('button'))
  cards.forEach((card, idx) => card.classList.toggle('active', idx === carouselIndex))
  dots.forEach((dot, idx) => dot.classList.toggle('active', idx === carouselIndex))
  const first = cards[0]
  if (first) {
    const gap = parseFloat(getComputedStyle(carouselTrack).gap || '0')
    slideWidth = first.offsetWidth + gap
    carouselTrack.style.transform = `translateX(${-carouselIndex * slideWidth}px)`
  }
}

function renderCarousel() {
  carouselTrack.innerHTML = ''
  carouselDots.innerHTML = ''

  if (!carouselItems.length) {
    const empty = document.createElement('article')
    empty.className = 'carousel-card active'
    empty.innerHTML = '<h4>Aucune image récente</h4><time>Ajoutez du contenu pour vos visiteurs.</time>'
    carouselTrack.appendChild(empty)
    carouselDots.style.display = 'none'
    return
  }

  carouselDots.style.display = 'flex'

  carouselItems.forEach((item, idx) => {
    const card = document.createElement('article')
    card.className = 'carousel-card'
    card.dataset.index = String(idx)

    const img = document.createElement('img')
    img.src = isImageUrl(item.imageUrl) ? item.imageUrl : PLACEHOLDER_IMG
    img.alt = item.name
    img.loading = 'lazy'
    img.onerror = () => { img.src = PLACEHOLDER_IMG }

    const title = document.createElement('h4')
    title.textContent = item.name

    const stamp = document.createElement('time')
    stamp.dateTime = item.createdAt
    stamp.textContent = new Date(item.createdAt).toLocaleString()

    card.appendChild(img)
    card.appendChild(title)
    card.appendChild(stamp)
    carouselTrack.appendChild(card)

    const dot = document.createElement('button')
    dot.type = 'button'
    dot.dataset.index = String(idx)
    dot.onclick = () => {
      setActiveSlide(idx)
      resetCarouselTimer()
    }
    carouselDots.appendChild(dot)
  })

  requestAnimationFrame(() => {
    setActiveSlide(0)
    resetCarouselTimer()
  })
}

function renderTable(items) {
  tableBody.innerHTML = ''
  items.forEach((it) => {
    const tr = document.createElement('tr')

    const tdImg = document.createElement('td')
    const thumb = document.createElement('img')
    thumb.src = isImageUrl(it.imageUrl) ? it.imageUrl : PLACEHOLDER_IMG
    thumb.alt = it.name
    thumb.className = 'thumbnail'
    thumb.loading = 'lazy'
    thumb.onerror = () => { thumb.src = PLACEHOLDER_IMG }
    tdImg.appendChild(thumb)

    const tdName = document.createElement('td')
    tdName.textContent = it.name

    const tdDate = document.createElement('td')
    tdDate.textContent = new Date(it.createdAt).toLocaleString()

    const tdActions = document.createElement('td')
    const delBtn = document.createElement('button')
    delBtn.className = 'icon-btn'
    delBtn.title = 'Supprimer'
    delBtn.textContent = '🗑'
    delBtn.onclick = async () => {
      if (!confirm('Supprimer cette image ? Cette action est irréversible.')) return
      try {
        const res = await fetch(`/api/images/${it.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          const message = payload?.error || 'Suppression impossible'
          alert(message)
          return
        }
        await Promise.all([loadList(), loadLatest(), loadCarousel()])
      } catch (err) {
        console.error('Erreur suppression', err)
        alert("Erreur durant la suppression de l'image")
      }
    }
    tdActions.appendChild(delBtn)

    tr.appendChild(tdImg)
    tr.appendChild(tdName)
    tr.appendChild(tdDate)
    tr.appendChild(tdActions)
    tableBody.appendChild(tr)
  })
}

async function loadLatest() {
  try {
    const { data, headers } = await fetchJSON('/api/latest')
    setServerBadgeInfo({
      serverNumber: data.serverNumber,
      dbSource: data.dbSource || headers.get('x-db-source'),
      writeDb: data.writeDb,
    })
    renderMainImage(data.item)
    return data.item
  } catch (err) {
    console.error('loadLatest failed', err)
    if (imageCaption) imageCaption.textContent = ''
    return null
  }
}

async function loadCarousel() {
  try {
    const { data, headers } = await fetchJSON('/api/latest-5')
    setServerBadgeInfo({
      serverNumber: data.serverNumber,
      dbSource: data.dbSource || headers.get('x-db-source'),
      writeDb: data.writeDb,
    })
    carouselItems = data.items || []
    renderCarousel()
  } catch (err) {
    console.error('loadCarousel failed', err)
    carouselItems = []
    renderCarousel()
  }
}

async function loadList() {
  try {
    const { data, headers } = await fetchJSON(`/api/images?page=${page}&limit=${limit}`)
    setServerBadgeInfo({
      serverNumber: data.serverNumber,
      dbSource: data.dbSource || headers.get('x-db-source'),
      writeDb: data.writeDb,
    })
    total = data.total || 0
    renderTable(data.items || [])
    const totalPages = Math.max(1, Math.ceil(total / limit))
    pageInfo.textContent = `Page ${page}/${totalPages}`
    prevPageBtn.disabled = page <= 1
    nextPageBtn.disabled = page >= totalPages
  } catch (err) {
    console.error('loadList failed', err)
  }
}

openFormBtn.onclick = () => formDialog.showModal()
closeFormBtn.onclick = () => formDialog.close()

uploadForm.onsubmit = async (event) => {
  event.preventDefault()
  formError.textContent = ''
  const name = nameInput.value.trim()
  const file = fileInput.files?.[0]
  if (!name || !file) {
    formError.textContent = 'Nom et image requis'
    return
  }
  const fd = new FormData()
  fd.append('name', name)
  fd.append('image', file)

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!res.ok) throw new Error('upload failed')
    formDialog.close()
    nameInput.value = ''
    fileInput.value = ''
    await Promise.all([loadLatest(), loadCarousel(), loadList()])
  } catch (err) {
    console.error('Upload failed', err)
    formError.textContent = "Erreur durant l'upload"
  }
}

prevBtn.onclick = () => {
  setActiveSlide(carouselIndex - 1)
  resetCarouselTimer()
}
nextBtn.onclick = () => {
  setActiveSlide(carouselIndex + 1)
  resetCarouselTimer()
}
prevPageBtn.onclick = async () => {
  if (page > 1) {
    page--
    await loadList()
  }
}
nextPageBtn.onclick = async () => {
  page++
  await loadList()
}

;(async function init() {
  await loadLatest()
  await loadCarousel()
  await loadList()
})()
