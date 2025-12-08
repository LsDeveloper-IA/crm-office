export function Header() {
  return (
    <header className="w-full bg-white shadow-md p-4 flex items-center justify-between">
      <h1 className="text-xl font-bold">My Application</h1>
      <nav>
        <ul className="flex space-x-4">
          <li><a href="#" className="text-gray-700 hover:text-gray-900">Home</a></li>
          <li><a href="#" className="text-gray-700 hover:text-gray-900">About</a></li>
          <li><a href="#" className="text-gray-700 hover:text-gray-900">Contact</a></li>
        </ul>
      </nav>
    </header>
  )
}