# Litsi Chat

Litsi Chat is a real-time video chat application built with Nuxt.js. It allows users to create and join rooms, and engage in private and instant video chats. The application is designed to be simple, secure, and easy to use.

## Features

- Instant and private video chats
- No sign-up or hassle
- Pure peer-to-peer connection, nothing is stored on the server
- Create rooms, invite friends, and chat instantly

## Getting Started

To get started, clone the repository and install the dependencies:

```bash
# pnpm or npm
pnpm install
```

Then, start the development server:

```bash
pnpm run dev
```

The application will be running at http://localhost:3000.

## Project Structure
The project is structured as follows:

- pages/: Contains the application routes.
- composables/: Contains the application composables.
- server/: Contains the server-side code.
- app.vue: The root component of the application.
- app.config.ts: The application configuration.

## TODO
-  improve documentation
-  making it easy to self host
-  adding some automated tests
-  refactoring the components
-  checking usernames in chatroom, setting max users, validating server data.
-  better layout for regular calls with more people
-  UI refinements
-  quick call link

## future improvements
- adding some local AI features
	- backgrounds
	- filters
	- noise reduction
- adding more fun stuff
	- reactions
	- raising hand
	- soundboard
	- GIFs
	- letting people share richer chat text

## Contributing
Contributions are welcome! Please open an issue or submit a pull request.

## License
Litsi Chat is licensed under the MIT License.

## Acknowledgements
This project uses the following dependencies:

- [Nuxt.js]()
- [Simple Peer]()
- [Vue.js]()


## Author
[Nirjan Khadka]()