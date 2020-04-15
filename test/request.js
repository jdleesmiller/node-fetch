import * as stream from 'stream';
import * as http from 'http';
import {Request} from '../src';
import TestServer from './utils/server';
import {AbortController} from 'abortcontroller-polyfill/dist/abortcontroller';
import chai from 'chai';
import FormData from 'form-data';
import Blob from 'fetch-blob';
import resumer from 'resumer';
import stringToArrayBuffer from 'string-to-arraybuffer';

const {expect} = chai;

const local = new TestServer();
const base = `http://${local.hostname}:${local.port}/`;

describe('Request', () => {
	it('should have attributes conforming to Web IDL', () => {
		const request = new Request('https://github.com/');
		const enumerableProperties = [];
		for (const property in request) {
			enumerableProperties.push(property);
		}

		for (const toCheck of [
			'body',
			'bodyUsed',
			'arrayBuffer',
			'blob',
			'json',
			'text',
			'method',
			'url',
			'headers',
			'redirect',
			'clone',
			'signal'
		]) {
			expect(enumerableProperties).to.contain(toCheck);
		}

		for (const toCheck of [
			'body', 'bodyUsed', 'method', 'url', 'headers', 'redirect', 'signal'
		]) {
			expect(() => {
				request[toCheck] = 'abc';
			}).to.throw();
		}
	});

	it('should support wrapping Request instance', () => {
		const url = `${base}hello`;

		const form = new FormData();
		form.append('a', '1');
		const {signal} = new AbortController();

		const r1 = new Request(url, {
			method: 'POST',
			follow: 1,
			body: form,
			signal
		});
		const r2 = new Request(r1, {
			follow: 2
		});

		expect(r2.url).to.equal(url);
		expect(r2.method).to.equal('POST');
		expect(r2.signal).to.equal(signal);
		// Note that we didn't clone the body
		expect(r2.body).to.equal(form);
		expect(r1.follow).to.equal(1);
		expect(r2.follow).to.equal(2);
		expect(r1.counter).to.equal(0);
		expect(r2.counter).to.equal(0);
	});

	it('should override signal on derived Request instances', () => {
		const parentAbortController = new AbortController();
		const derivedAbortController = new AbortController();
		const parentRequest = new Request(`${base}hello`, {
			signal: parentAbortController.signal
		});
		const derivedRequest = new Request(parentRequest, {
			signal: derivedAbortController.signal
		});
		expect(parentRequest.signal).to.equal(parentAbortController.signal);
		expect(derivedRequest.signal).to.equal(derivedAbortController.signal);
	});

	it('should allow removing signal on derived Request instances', () => {
		const parentAbortController = new AbortController();
		const parentRequest = new Request(`${base}hello`, {
			signal: parentAbortController.signal
		});
		const derivedRequest = new Request(parentRequest, {
			signal: null
		});
		expect(parentRequest.signal).to.equal(parentAbortController.signal);
		expect(derivedRequest.signal).to.equal(null);
	});

	it('should throw error with GET/HEAD requests with body', () => {
		expect(() => new Request('.', {body: ''}))
			.to.throw(TypeError);
		expect(() => new Request('.', {body: 'a'}))
			.to.throw(TypeError);
		expect(() => new Request('.', {body: '', method: 'HEAD'}))
			.to.throw(TypeError);
		expect(() => new Request('.', {body: 'a', method: 'HEAD'}))
			.to.throw(TypeError);
		expect(() => new Request('.', {body: 'a', method: 'get'}))
			.to.throw(TypeError);
		expect(() => new Request('.', {body: 'a', method: 'head'}))
			.to.throw(TypeError);
	});

	it('should default to null as body', () => {
		const request = new Request(base);
		expect(request.body).to.equal(null);
		return request.text().then(result => expect(result).to.equal(''));
	});

	it('should support parsing headers', () => {
		const url = base;
		const request = new Request(url, {
			headers: {
				a: '1'
			}
		});
		expect(request.url).to.equal(url);
		expect(request.headers.get('a')).to.equal('1');
	});

	it('should support arrayBuffer() method', () => {
		const url = base;
		const request = new Request(url, {
			method: 'POST',
			body: 'a=1'
		});
		expect(request.url).to.equal(url);
		return request.arrayBuffer().then(result => {
			expect(result).to.be.an.instanceOf(ArrayBuffer);
			const string = String.fromCharCode.apply(null, new Uint8Array(result));
			expect(string).to.equal('a=1');
		});
	});

	it('should support text() method', () => {
		const url = base;
		const request = new Request(url, {
			method: 'POST',
			body: 'a=1'
		});
		expect(request.url).to.equal(url);
		return request.text().then(result => {
			expect(result).to.equal('a=1');
		});
	});

	it('should support json() method', () => {
		const url = base;
		const request = new Request(url, {
			method: 'POST',
			body: '{"a":1}'
		});
		expect(request.url).to.equal(url);
		return request.json().then(result => {
			expect(result.a).to.equal(1);
		});
	});

	it('should support buffer() method', () => {
		const url = base;
		const request = new Request(url, {
			method: 'POST',
			body: 'a=1'
		});
		expect(request.url).to.equal(url);
		return request.buffer().then(result => {
			expect(result.toString()).to.equal('a=1');
		});
	});

	it('should support blob() method', () => {
		const url = base;
		const request = new Request(url, {
			method: 'POST',
			body: Buffer.from('a=1')
		});
		expect(request.url).to.equal(url);
		return request.blob().then(result => {
			expect(result).to.be.an.instanceOf(Blob);
			expect(result.size).to.equal(3);
			expect(result.type).to.equal('');
		});
	});

	it('should support clone() method', () => {
		const url = base;
		let body = resumer().queue('a=1').end();
		body = body.pipe(new stream.PassThrough());
		const agent = new http.Agent();
		const {signal} = new AbortController();
		const request = new Request(url, {
			body,
			method: 'POST',
			redirect: 'manual',
			headers: {
				b: '2'
			},
			follow: 3,
			compress: false,
			agent,
			signal
		});
		const cl = request.clone();
		expect(cl.url).to.equal(url);
		expect(cl.method).to.equal('POST');
		expect(cl.redirect).to.equal('manual');
		expect(cl.headers.get('b')).to.equal('2');
		expect(cl.follow).to.equal(3);
		expect(cl.compress).to.equal(false);
		expect(cl.method).to.equal('POST');
		expect(cl.counter).to.equal(0);
		expect(cl.agent).to.equal(agent);
		expect(cl.signal).to.equal(signal);
		// Clone body shouldn't be the same body
		expect(cl.body).to.not.equal(body);
		return Promise.all([cl.text(), request.text()]).then(results => {
			expect(results[0]).to.equal('a=1');
			expect(results[1]).to.equal('a=1');
		});
	});

	it('should support ArrayBuffer as body', () => {
		const request = new Request(base, {
			method: 'POST',
			body: stringToArrayBuffer('a=1')
		});
		return request.text().then(result => {
			expect(result).to.equal('a=1');
		});
	});

	it('should support Uint8Array as body', () => {
		const request = new Request(base, {
			method: 'POST',
			body: new Uint8Array(stringToArrayBuffer('a=1'))
		});
		return request.text().then(result => {
			expect(result).to.equal('a=1');
		});
	});

	it('should support DataView as body', () => {
		const request = new Request(base, {
			method: 'POST',
			body: new DataView(stringToArrayBuffer('a=1'))
		});
		return request.text().then(result => {
			expect(result).to.equal('a=1');
		});
	});
});
