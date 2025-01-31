import path from "path";
import fs from "fs";
import os from "os";
import logger from "../logger";
import Handlebars from "handlebars";
/**
 * Parser class for GRPC Protocol mocks to define handlers for:
 * - Unary calls
 * - Server streaming calls
 * - Client streaming calls
 * - Bidirectional streaming calls
 */
export default class GrpcParser {
  private grpcMocksDir: string;
  /**
   *
   * @param {string} grpcMocksDir location of mocks dir for grpc mocks
   */
  constructor(grpcMocksDir: string) {
    this.grpcMocksDir = grpcMocksDir;
  }
  /**
   * - Get the path of the determined handler from the call
   * - Find a mock file for the handler
   * - If mock file exists, apply handler compilation to generate actual values from helpers
   * - Execute callback with the response and delay
   * - Remove delay key if present before sending the response
   * - If mock file is not found, log error and send the same error to client
   * @param {any} call call object recieved with every unary call
   * @param {any} callback callback to be executed once server is ready to return response
   */
  camouflageMock = (call: any, callback: any) => {
    try {
      let handlerPath = call.call.handler.path;
      let mockFile = handlerPath.replace(".", "/");
      let mockFilePath = path.join(this.grpcMocksDir, mockFile + ".mock");
      if (fs.existsSync(mockFilePath)) {
        const template = Handlebars.compile(fs.readFileSync(mockFilePath, "utf-8").toString());
        const fileContent = template({ request: call.request });
        logger.debug(`Mock file path: ${mockFilePath}`);
        logger.debug(`Response: ${fileContent}`);
        const response = JSON.parse(fileContent);
        const delay: number = response.delay || 0;
        delete response.delay;
        setTimeout(() => {
          callback(null, response);
        }, delay);
      } else {
        logger.error(`No suitable mock file was found for ${mockFilePath}`);
        callback(null, { error: `No suitable mock file was found for ${mockFilePath}` });
      }
    } catch (error) {
      logger.error(error);
      callback(null, { error: error });
    }
  };
  /**
   * - Get the path of the determined handler from the call
   * - Find a mock file for the handler
   * - If mock file exists, apply handler compilation to generate actual values from helpers
   * - Split the contents of file with ==== to get responses each stream
   * - Run a forEach and execute call.write() with the response and delay
   * - On last index of streamArray, execute call.end()
   * - Remove delay key if present before sending the response
   * - If mock file is not found, log error and send the same error to client
   * @param {any} call call object recieved with every unary call
   * @param {any} callback callback to be executed once server is ready to return response
   */
  camouflageMockServerStream = (call: any) => {
    let handlerPath = call.call.handler.path;
    let mockFile = handlerPath.replace(".", "/");
    let mockFilePath = path.join(this.grpcMocksDir, mockFile + ".mock");
    if (fs.existsSync(mockFilePath)) {
      try {
        const template = Handlebars.compile(fs.readFileSync(mockFilePath, "utf-8").toString());
        const fileContent = template({ request: call.request });
        logger.debug(`Mock file path: ${mockFilePath}`);
        let streamArr = fileContent.split("====");
        let delay: number = 0;
        streamArr.forEach((stream: any, index: number) => {
          let parsedStream = JSON.parse(stream.replace(os.EOL, ""));
          delay = delay + (parsedStream.delay || 0);
          delete parsedStream["delay"];
          logger.debug(`Sending stream: ${JSON.stringify(parsedStream, null, 2)}`);
          logger.debug(`Sending stream with delay of: ${delay}`);
          switch (index) {
            case streamArr.length - 1:
              setTimeout(() => {
                call.write(JSON.parse(stream));
                call.end();
              }, delay);
              break;
            default:
              setTimeout(() => {
                call.write(JSON.parse(stream));
              }, delay);
              break;
          }
        });
      } catch (error) {
        logger.error(error);
        call.end();
      }
    } else {
      logger.error(`No suitable mock file was found for ${mockFilePath}`);
      call.write({ error: `No suitable mock file was found for ${mockFilePath}` });
      call.end();
    }
  };
  /**
   * - Get the path of the determined handler from the call
   * - Find a mock file for the handler
   * - If mock file exists, apply handler compilation to generate actual values from helpers
   * - No action required on recieving client's streams
   * - Once client calls end, respond with the compiled contents of the mockfile and delay
   * - Remove delay key if present before sending the response
   * - If mock file is not found, log error and send the same error to client
   * @param {any} call call object recieved with every unary call
   * @param {any} callback callback to be executed once server is ready to return response
   */
  camouflageMockClientStream = (call: any, callback: any) => {
    call.on("data", () => {
      // TODO: Not sure if it's needed
    });
    call.on("end", () => {
      try {
        let handlerPath = call.call.handler.path;
        let mockFile = handlerPath.replace(".", "/");
        let mockFilePath = path.join(this.grpcMocksDir, mockFile + ".mock");
        if (fs.existsSync(mockFilePath)) {
          const template = Handlebars.compile(fs.readFileSync(mockFilePath, "utf-8").toString());
          const fileContent = template({ request: call.request });
          logger.debug(`Mock file path: ${mockFilePath}`);
          logger.debug(`Response: ${fileContent}`);
          const response = JSON.parse(fileContent);
          const delay: number = response.delay || 0;
          delete response.delay;
          setTimeout(() => {
            callback(null, response);
          }, delay);
        } else {
          logger.error(`No suitable mock file was found for ${mockFilePath}`);
          callback(null, { error: `No suitable mock file was found for ${mockFilePath}` });
        }
      } catch (error) {
        logger.error(error);
        callback(null, { error: error });
      }
    });
  };
  /**
   * - Get the path of the determined handler from the call
   * - Find a mock file for the handler
   * - If mock file exists, apply handler compilation to generate actual values from helpers
   * - Follow a ping pong model, i.e. for every client's stream, respond with a server stream.
   * - On client stream, respond with filecontent.data
   * - Once client calls end, respond with filecontent.end
   * - Remove delay key if present before sending the response
   * - If mock file is not found, log error and send the same error to client
   * @param {any} call call object recieved with every unary call
   * @param {any} callback callback to be executed once server is ready to return response
   */
  camouflageMockBidiStream = (call: any) => {
    let handlerPath = call.call.handler.path;
    let mockFile = handlerPath.replace(".", "/");
    let mockFilePath = path.join(this.grpcMocksDir, mockFile + ".mock");
    call.on("data", () => {
      if (fs.existsSync(mockFilePath)) {
        try {
          const template = Handlebars.compile(fs.readFileSync(mockFilePath, "utf-8").toString());
          const fileContent = template({ request: call.request });
          logger.debug(`Mock file path: ${mockFilePath}`);
          logger.debug(`Response: ${fileContent}`);
          const response = JSON.parse(fileContent);
          const delay: number = response.data.delay || 0;
          delete response.data.delay;
          setTimeout(() => {
            call.write(response.data);
          }, delay);
        } catch (error) {
          logger.error(error);
          call.end();
        }
      } else {
        logger.error(`No suitable mock file was found for ${mockFilePath}`);
        call.write({ error: `No suitable mock file was found for ${mockFilePath}` });
        call.end();
      }
    });
    call.on("end", () => {
      if (fs.existsSync(mockFilePath)) {
        try {
          const template = Handlebars.compile(fs.readFileSync(mockFilePath, "utf-8").toString());
          const fileContent = template({ request: call.request });
          logger.debug(`Mock file path: ${mockFilePath}`);
          logger.debug(`Response: ${fileContent}`);
          const response = JSON.parse(fileContent);
          if (response.end) {
            const delay: number = response.end.delay || 0;
            delete response.end.delay;
            setTimeout(() => {
              call.write(response.end);
              call.end();
            }, delay);
          } else {
            call.end();
          }
        } catch (error) {
          logger.error(error);
          call.end();
        }
      } else {
        logger.error(`No suitable mock file was found for ${mockFilePath}`);
        call.write({ error: `No suitable mock file was found for ${mockFilePath}` });
        call.end();
      }
    });
  };
}
